
# Inbox Manager — Plan

## Decision: reuse existing IMAP, don't add `fetch-inbox`

The project already has `inbox-sync` (raw `Deno.connectTls` IMAP). No reliable Deno/edge IMAP library exists, so we extend `inbox-sync` rather than create a parallel `fetch-inbox`. The `inbox_messages` table is also already in place — we'll add the missing columns instead of creating `inbox_emails`.

## 1. Database migration

Add to existing `inbox_messages`:
- `message_id TEXT` — RFC822 `Message-ID` header (for threading + reply `In-Reply-To`)
- `in_reply_to TEXT`, `references TEXT` — for thread grouping
- `thread_id TEXT` — derived (normalized subject + participants) on insert
- `body_html TEXT` — keep HTML alongside the existing plain `body`
- `raw_headers JSONB`
- `is_replied BOOLEAN DEFAULT false`
- `is_archived BOOLEAN DEFAULT false`
- `replied_at TIMESTAMPTZ`
- Unique index `(account_id, message_id)` where `message_id IS NOT NULL`

Enable realtime on `inbox_messages` for the unread badge.

## 2. Extend `inbox-sync` edge function

In the MIME parser, also capture:
- `Message-ID`, `In-Reply-To`, `References`
- HTML body part (currently discarded — keep it as `body_html`)
- Raw headers as JSON

Compute `thread_id`:
1. If `In-Reply-To`/`References` matches an existing `message_id` in this account → inherit that row's `thread_id`.
2. Else `thread_id = message_id`.

Add `fetch_all` mode: when invoked with `{ fetch_all: true }` and no user JWT (cron call with service role), loop through every `email_accounts` row with `imap_host` set and sync each.

## 3. pg_cron job (every 5 min)

Schedule a call to `inbox-sync` with `{ fetch_all: true }` using `net.http_post` and the anon key — registered via the `supabase--insert` tool (not migration, contains project-specific URL).

## 4. New `send-reply` edge function

Wraps `_shared/send-email-internal.ts` and additionally:
- Sets `In-Reply-To: <original.message_id>` and `References:` headers on the outgoing MIME (requires extending `send-email-internal.ts` to accept these optional headers and pass them to `denomailer`'s `client.send({ headers: {...} })`).
- Auto-prefixes subject with `Re: ` if absent.
- On success: marks original message `is_replied = true`, `replied_at = now()`, and inserts an outbound row into `inbox_messages` with the same `thread_id` so it appears inline in the thread view.

## 5. Rewrite `/inbox` page (two-panel layout)

Replace current `src/pages/Inbox.tsx` with three columns inside one route:

```text
┌──────────────┬──────────────┬─────────────────────┐
│ Accounts     │ Thread list  │ Thread + reply      │
│ (with unread │ (newest      │ (messages stacked,  │
│ badge each)  │  first)      │  reply box pinned)  │
└──────────────┴──────────────┴─────────────────────┘
```

**Left — Accounts panel**
- List from `email_accounts`. Show name, email, reputation score badge (join `warmup_scores` latest by `account_id`), and unread count per account (`count where account_id = X and is_read = false and is_archived = false and is_warmup = false`).
- Active account highlighted with primary border.

**Middle — Thread list**
- Group `inbox_messages` by `thread_id`, show the latest message per thread.
- Sender name + email, truncated subject, first-line preview of `body`, relative time (`date-fns formatDistanceToNow`).
- Unread = bold + left accent border.
- Hover row reveals quick actions: mark read/unread, add to CRM, archive.

**Right — Thread view + reply**
- Loads all messages in the selected `thread_id` sorted oldest→newest, auto-scroll to bottom.
- Each message: initials avatar, sender, timestamp, body. Prefer `body` (plain); if only `body_html`, render in sandboxed `<iframe srcDoc>`.
- Reply box (plain `<textarea>`) pinned at bottom:
  - `To` = original sender (read-only chip)
  - `Subject` = `Re: <original>` (read-only chip)
  - "Send Reply" → calls `send-reply` edge function
  - On success: toast "Reply sent", optimistically appends the sent message into the thread, marks original as replied.

## 6. Quick actions

- **Mark read/unread** — update `is_read` directly via supabase client.
- **Archive** — set `is_archived = true`; filter from default list (add an "Archived" toggle in the thread-list header).
- **Add to CRM** — insert into `contacts` (`email`, `first_name`/`last_name` parsed from `from_name`, `source = 'inbox'`, `user_id = auth.uid()`); toast confirms with link to `/contacts`. No GHL integration — use local `contacts` table only (matches rest of app).

## 7. Sidebar unread badge

In `AppSidebar.tsx`, add an unread count next to **Inbox** (mirror the existing Unibox badge pattern). Source:
```ts
supabase.from('inbox_messages')
  .select('*', { count: 'exact', head: true })
  .eq('is_read', false).eq('is_archived', false).eq('is_warmup', false)
```
Subscribe to realtime `postgres_changes` on `inbox_messages` to update live; clean up channel in `useEffect` return.

## 8. Out of scope (per your "do not change" list)

SMTP send pipeline, campaign flow, warmup engine, Unibox, and contacts page logic stay untouched. `send-reply` is additive and only reads from `_shared/send-email-internal.ts` (which gets one backward-compatible signature addition for custom headers).

## Files touched

- **New migration** — columns + unique index + realtime publication
- **New** `supabase/functions/send-reply/index.ts`
- **Edit** `supabase/functions/inbox-sync/index.ts` — capture Message-ID/In-Reply-To/References/HTML/headers, derive thread_id, support `fetch_all`
- **Edit** `supabase/functions/_shared/send-email-internal.ts` — optional `inReplyTo`/`references` headers
- **Edit** `supabase/config.toml` — register `send-reply` with `verify_jwt = false`
- **Rewrite** `src/pages/Inbox.tsx` — three-panel layout
- **New** `src/components/inbox/AccountsPanel.tsx`, `ThreadList.tsx`, `ThreadView.tsx`, `ReplyBox.tsx`
- **Edit** `src/components/AppSidebar.tsx` — unread badge for Inbox
- **pg_cron insert** via `supabase--insert` after migration approves

## Technical notes

- Threading fallback: when an inbound email has no `In-Reply-To`, group by normalized subject (strip `Re:`/`Fwd:`) + (from_email ∈ thread participants OR to_email = account.email) within a 30-day window. Stored on insert so list queries stay cheap.
- HTML rendering: use `<iframe sandbox srcDoc={body_html}>` with no `allow-scripts` to neutralize tracking pixels and JS.
- Reply optimistic update: insert a local-only object into thread state immediately; reconcile when next sync picks it up via Message-ID.
- Cron job uses the anon key + `verify_jwt = false` on `inbox-sync`, with an internal `fetch_all` branch that uses the service role client and skips the user-JWT check.

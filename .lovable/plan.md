## Problem

The Inbox is empty because `inbox-sync` is dying with **"CPU Time exceeded"** on every cron run. Logs show the function connects to the first 3 accounts (`consult@outreachli.com`, `mike@getpluggednetwork.com`, `amelia@aristral.com`) and is killed before any sync completes — no messages are upserted, no `last_synced_uid` is advanced, so the inbox stays empty forever.

## Root cause

`inbox-sync` `fetch_all` mode iterates accounts **sequentially in one invocation**:

```ts
for (const acc of accounts || []) {
  const r = await syncAccount(acc, supabaseAdmin);
}
```

Each `syncAccount` does a full IMAP handshake → LOGIN → SELECT → SEARCH → FETCH up to 50 messages → MIME-parse → per-message DB lookups for threading → upsert → per-message reply-event matching. With 5+ accounts that's well over the edge-function CPU budget (~150–400ms wall but strict CPU cap). The function is force-killed mid-account 2, every account after that never syncs, and the first account's `last_synced_uid` is only written if it reaches the end of its own body — so it keeps re-fetching the same UIDs next run and dying again.

Secondary contributor: the threading lookup runs **two DB queries per message** (parent lookup + 30-day subject scan of up to 50 rows) — that's 100+ awaits per account on top of the MIME work.

## Fix

1. **Parallelize accounts in `fetch_all`** — replace the `for` loop with `Promise.allSettled(accounts.map(syncAccount))`. Accounts are independent (different TCP connections, different rows); running them concurrently turns wall-time into the slowest single account instead of the sum, and CPU time per account stays under budget because each one spends most of its time awaiting network I/O.

2. **Cut the threading cost** — skip the 30-day subject-scan fallback when `in_reply_to`/`references` already produced a match, and `.limit(20)` instead of 50. Also batch the parent-message lookup: do **one** `.in('message_id', allParentRefs)` query per account instead of one per message.

3. **Skip the reply-event matching loop on the cron path** when a message has no `in_reply_to` *and* isn't from a known contact — currently every inbound message triggers a contact lookup. Gate it: only run the matcher for messages whose `from_email` domain matches a domain we've sent to (cheap pre-filter via a single `IN` query per account).

4. **Persist progress incrementally** — move the `last_synced_uid` update to happen after each batch of 10 UIDs is upserted, not only at the very end. If the function is killed mid-account, the next run resumes instead of re-processing the same UIDs.

5. **Cap per-account work harder on cron** — when invoked with `fetch_all: true`, lower the per-account fetch ceiling from 50 to 25 UIDs. Manual single-account syncs (the "Sync" button in the UI) keep the 50 cap.

6. **Add a hard 8s timeout per account** — wrap `syncAccount` in `Promise.race` with an 8s deadline so one stalled IMAP server (Gmail can hang) can't drag the whole batch into the CPU cap.

## Out of scope

- IMAP auth failures for `developer@aristral.com` / `musagillani@tz-solution.com` shown in `warmup-rescue` logs — separate credential issue, surface via UI later.
- UI changes to Inbox/Unibox.
- Re-architecting threading.

## Files

- `supabase/functions/inbox-sync/index.ts` — all 6 changes above.

No DB migration, no new secrets, no edge-function config changes.

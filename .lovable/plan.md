

# Real IMAP Inbox Sync via Raw TCP

## Approach

Since IMAP libraries don't work in Deno Edge Functions, we'll use the same raw TCP approach that worked for `smtp-test` — speaking the IMAP protocol directly via `Deno.connectTls`/`Deno.connect`. IMAP is a text-based protocol, and for inbox syncing we only need a handful of commands: `LOGIN`, `SELECT INBOX`, `SEARCH` (for new messages), `FETCH` (headers + body), and `LOGOUT`.

## How It Works

1. Connect to the user's IMAP server (host/port from `email_accounts` table)
2. Authenticate with their stored credentials
3. Select INBOX
4. Search for messages received since the last sync (tracked via a `last_synced_uid` column)
5. Fetch new message headers (From, Subject, Date) and body text
6. Insert into `inbox_messages` table, deduplicating by a message-id hash
7. Update `last_synced_uid` on the account

## Changes

### 1. Database Migration
- Add `last_synced_uid` (integer, default 0) and `imap_host` + `imap_port` columns to `email_accounts` if not already present
- Add `message_uid` (text, unique per account) to `inbox_messages` for deduplication

### 2. Edge Function Rewrite (`supabase/functions/inbox-sync/index.ts`)

Replace demo data with real IMAP sync:

- **`imapConnect(host, port)`** — opens TLS connection via `Deno.connectTls` (port 993) or plain + STARTTLS
- **`imapCommand(conn, tag, command)`** — sends a tagged IMAP command, reads response lines until the tagged completion line (`tag OK/NO/BAD`)
- **`imapLogin(conn, user, pass)`** — sends `LOGIN` command
- **`imapSelect(conn, mailbox)`** — sends `SELECT INBOX`, parses EXISTS count
- **`imapSearch(conn, since_uid)`** — sends `UID SEARCH UID {since_uid}:*` to find new messages
- **`imapFetch(conn, uids)`** — sends `UID FETCH {uids} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`, parses responses
- **`imapLogout(conn)`** — sends `LOGOUT`

Flow:
1. Look up account credentials from DB
2. Connect + login
3. Select INBOX
4. Search for UIDs > last_synced_uid
5. Fetch in batches of 20
6. Parse From/Subject/Date/Body from raw IMAP response
7. Upsert into `inbox_messages` with `message_uid` for dedup
8. Update `last_synced_uid` on account

Error handling: if connection or auth fails, return a clear error message (wrong credentials, server unreachable, etc.)

### 3. No Frontend Changes Needed

The Unibox page already reads from `inbox_messages` and calls the `inbox-sync` function — it will work automatically with real data.

## Limitations & Notes

- Raw IMAP parsing is basic — handles standard RFC 2822 headers but may not perfectly parse every edge case (e.g., multipart MIME with deeply nested attachments). Plain text and simple HTML bodies will work.
- Fetches up to 50 new messages per sync to stay within Edge Function timeout limits.
- IMAP IDLE (push notifications) isn't possible — sync is pull-based (user clicks "Sync" or we add a periodic trigger later).

## Files Changed

| File | Action |
|------|--------|
| `supabase/functions/inbox-sync/index.ts` | Rewrite with real IMAP via raw TCP |
| Database migration | Add `last_synced_uid` to `email_accounts`, `message_uid` to `inbox_messages` |


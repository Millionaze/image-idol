## What's actually happening

You added a new account "Dav Williams" with email `dave@millionaze.net`, but the **Username** field on the account form was filled in as `info@irfanics.com` (likely auto-filled or copy-pasted from the prior "Warmup" account you set up just before it).

The IMAP sync uses the `username` field to log into the mailbox — not the `email` field. So Dave's account is logging into `info@irfanics.com`'s mailbox and pulling those messages, then storing them under Dave's `account_id`. That's why you see "random old emails" — they're actually Irfan's emails.

Evidence from the database:
- `dave@millionaze.net` row has `username = info@irfanics.com`
- Both Dave and the Warmup account ended at the exact same `last_synced_uid: 143`

## Fix plan

### 1. Clean up Dave's account (database)
- Update `email_accounts.username` for Dave from `info@irfanics.com` → `dave@millionaze.net` (and have you re-enter the correct password since the saved password is for the wrong mailbox).
- Delete the wrongly-imported `inbox_messages` rows tied to Dave's `account_id`.
- Reset `last_synced_uid = 0` on Dave so the next sync starts fresh against the correct mailbox.

### 2. Improve the Add Account form (src/pages/Accounts.tsx) to prevent recurrence
- **Auto-fill Username from Email** as the user types in the Email field (only when Username is empty or still matches the previous email value). Most providers use the email as the username.
- Add helper text under the Username field: *"Usually the same as your email address. Only change this if your provider uses a different IMAP/SMTP login (rare)."*
- Add a small warning banner if `username` does not match `email` at save time, asking the user to confirm.

### 3. Defensive backend check (supabase/functions/inbox-sync/index.ts)
- Optional: log a warning when `account.username` differs from `account.email` so future mismatches are easier to spot in edge function logs.

## Technical notes

- The IMAP sync logic itself is correct — it filters by `account_id` and stores messages under the right account. The bug is purely in the saved credentials, which made the sync log into the wrong mailbox.
- No schema changes required; only a data fix and a UX tweak.
- After the fix, clicking "Sync" on Dave's account will fetch the most recent ~50 messages from `dave@millionaze.net`'s actual inbox.

## What I need from you before applying the data fix

The current saved password for Dave is `info@irfanics.com`'s password. Once we wipe Dave's bad messages and reset the username to `dave@millionaze.net`, you'll need to either:
- Edit Dave's account and re-enter the correct password for `dave@millionaze.net`, or
- Delete and re-create Dave from scratch (cleaner).

Tell me which you prefer when you approve.

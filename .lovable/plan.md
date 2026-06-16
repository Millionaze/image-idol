## Problem

The `email_accounts` table has a single `username` / `password` pair used for both SMTP and IMAP. That works when SMTP and IMAP are the same provider, but breaks for hybrid setups like `dave@millionaze.net`:

- **SMTP** = Brevo → username `ae3170001@smtp-brevo.com` + Brevo SMTP key
- **IMAP** = GoDaddy (`imap.secureserver.net`) → username `dave@millionaze.net` + mailbox password

Today the IMAP sync uses the Brevo credentials against GoDaddy, which is why every cron tick returns `AUTHENTICATIONFAILED`.

## Plan: split credentials into SMTP and IMAP

### Database (1 migration)

Add two optional columns to `public.email_accounts`:

- `imap_username TEXT`
- `imap_password TEXT`

Backfill: leave both NULL. Existing accounts where SMTP=IMAP keep working because the read path falls back to `username` / `password` when the IMAP-specific fields are NULL.

No RLS or grant changes needed (columns added to existing table).

### Edge functions

- `inbox-sync/index.ts` — change credential resolution to:
  ```
  const username = account.imap_username || account.username || account.email;
  const password = account.imap_password || account.password;
  ```
  Same change in `warmup-rescue` (uses IMAP) so it benefits from the split.
- `send-campaign`, `smtp-test`, `process-sequences`, `warmup-run`, `_shared/send-email-internal`, `_shared/smtp-helpers` — keep using `account.username` / `account.password` (these are the SMTP credentials). No change needed there.

### UI (`src/pages/Accounts.tsx`)

- Relabel current **Username / Password** fields to **SMTP Username / SMTP Password**.
- Add a collapsible **"IMAP uses different credentials"** toggle below them. When checked, reveal two new fields: **IMAP Username** (defaults to email) and **IMAP Password**. Hidden by default so single-provider users see the same simple form.
- On submit (Add + Edit), only include `imap_username` / `imap_password` in the payload when the toggle is on; otherwise send NULL (so we don't accidentally pin stale split creds for users who switch back to a unified provider).
- Update the email-mirroring logic so changing the email auto-mirrors IMAP Username (when split is enabled and IMAP Username was empty/tracking email), not the SMTP one.
- Drop the current "Username does not match Email" warning when split mode is on — that warning only makes sense for unified setups.

### Out of scope

- No change to `send-campaign`, sequencing, warmup send path — they correctly use SMTP creds today.
- No "Test IMAP" button (separate request).
- No migration of existing rows; users with hybrid setups need to open Edit, enable the toggle, and enter their IMAP creds once.

### Files touched

1. New migration adding `imap_username`, `imap_password` to `email_accounts`.
2. `supabase/functions/inbox-sync/index.ts` — credential fallback.
3. `supabase/functions/warmup-rescue/index.ts` — same fallback.
4. `src/pages/Accounts.tsx` — split form fields + toggle + payload logic for both Add and Edit dialogs.
5. `src/integrations/supabase/types.ts` — auto-regenerated, not edited by hand.

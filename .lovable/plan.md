## Plan

1. **Database update**
   - Run exactly this SQL against `email_accounts`:
     ```sql
     UPDATE email_accounts
     SET smtp_port = 465,
         smtp_secure = true
     WHERE smtp_host = 'smtp-relay.brevo.com';
     ```
   - Do not touch IMAP columns or any other SMTP fields.

2. **Revert SMTPClient TLS initialization only**
   - In these files, remove the temporary port-derived TLS variables and set `tls` back to the stored DB value:
     - `supabase/functions/send-campaign/index.ts`
     - `supabase/functions/process-sequences/index.ts`
     - `supabase/functions/_shared/send-email-internal.ts`
     - `supabase/functions/warmup-run/index.ts`
   - Preserve the existing host, port, username, and password wiring.

3. **Keep previous safeguards unchanged**
   - Keep `InvalidContentType` / `corrupt message` handling in `smtp-helpers.ts`.
   - Keep the Accounts UI guard that auto-sets `smtp_secure` based on port.
   - Do not change frontend UI or unrelated logic.

4. **Deploy and confirm**
   - Redeploy the affected Edge Functions: `send-campaign`, `process-sequences`, and `warmup-run`.
   - Confirm in the database that both Brevo accounts now have `smtp_port = 465` and `smtp_secure = true`.
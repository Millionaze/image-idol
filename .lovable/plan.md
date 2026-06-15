
# Fix: Brevo SMTP TLS mismatch — 4 changes, scoped exactly as requested

No UI/logic touched outside the items below.

---

## Change 1 — DB data fix (insert tool, not migration)

Run via the data-update tool:

```sql
UPDATE email_accounts
SET smtp_secure = false
WHERE smtp_host = 'smtp-relay.brevo.com'
  AND smtp_port = 587;
```

Affects the two existing accounts (`dave@millionaze.net`, `info@millionaze.net`).

## Change 2 — Port-aware TLS in all sending paths

Replace the `SMTPClient` init block in:

- `supabase/functions/send-campaign/index.ts` (~line 118)
- `supabase/functions/process-sequences/index.ts` (~line 87)
- `supabase/functions/_shared/send-email-internal.ts` (~line 51)
- `supabase/functions/warmup-run/index.ts` (~lines 176 and 434)

From `tls: account.smtp_secure` to:

```ts
const useImplicitTls = account.smtp_port === 465;
const client = new SMTPClient({
  connection: {
    hostname: account.smtp_host,
    port:     account.smtp_port,
    tls:      useImplicitTls,
    auth: { username: account.username, password: account.password },
  },
});
```

(For `warmup-run` the two call sites use variables `replier`/`sender` instead of `account` — same pattern, swapped name.)

## Change 3 — Classifier recognises TLS handshake failure as fatal

In `supabase/functions/_shared/smtp-helpers.ts`, extend the `connectionFatal` detection in `classifySmtpError` to also match:

- `invalidcontenttype`
- `corrupt message`

So one TLS-handshake failure breaks the batch instead of burning every contact.

## Change 4 — UI guard in the SMTP form

In `src/pages/Accounts.tsx` (add form around L346 and edit form around L530):

- When the user changes `smtp_port` to `587` → auto-set `smtp_secure = false`.
- When they change it to `465` → auto-set `smtp_secure = true`.
- Add a small muted helper line under the port input:
  *"Port 587 uses STARTTLS. Port 465 uses implicit TLS."*

The TLS toggle stays editable for non-standard ports.

---

## Out of scope (per your instruction)

- No changes to retry logic, dashboards, or any other feature.
- No env-var changes; SMTP creds remain per-row in `email_accounts`.

Approve and I'll apply all four in one pass.

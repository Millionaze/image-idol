## Problem

A new user is trying to connect a GoDaddy mailbox (`secureserver.net`) on port **465** with TLS, and the SMTP test fails. Edge function logs confirm it:

```
SMTP test error: Connection reset by peer (os error 104)
```

The TCP socket is reset during the TLS handshake on port 465. The account never reaches the DB because `saveAccount()` only inserts after `smtp-test` returns success.

## Likely causes (all common for GoDaddy)

1. **Wrong host.** GoDaddy users often enter `smtp.secureserver.net`, `relay-hosting.secureserver.net`, or their domain — the correct hosts are `smtpout.secureserver.net` (legacy Workspace Email) or `smtp.office365.com` (if the mailbox is GoDaddy-resold Microsoft 365).
2. **Port 465 blocked / rate-limited from Supabase edge IPs.** GoDaddy is known to reset port 465 from datacenter IP ranges. Port **587 with STARTTLS** usually succeeds where 465 fails. Alternates: 80, 3535.
3. **Mailbox is actually Microsoft 365.** Implicit TLS to `secureserver.net` will never work because the user picked the wrong server.

Right now we surface a raw `Connection reset by peer (os error 104)` with no guidance, so the user has nothing to act on.

## Fix — 2 changes, frontend + edge function only

### 1. `supabase/functions/smtp-test/index.ts` — auto-retry + actionable errors

When the initial connect fails with ECONNRESET/timeout (or the TLS handshake throws on port 465):

- If the failing port was **465**, automatically retry once on **587** with STARTTLS using the same credentials. If the retry succeeds, return `{ success: true, suggestedPort: 587, suggestedSecure: false }` so the UI can prompt the user to switch.
- If both fail, classify the error and return a human-readable `error` plus an `errorCode`:
  - `connection_reset` / `connection_timeout` → "Your provider reset the connection on port {port}. This is common with GoDaddy on 465 from cloud IPs — try port 587 with TLS off (STARTTLS will be used automatically)."
  - `unknown_host` → "Hostname not found. For GoDaddy Workspace Email use `smtpout.secureserver.net`; for GoDaddy-resold Microsoft 365 use `smtp.office365.com`."
  - `auth_failed` → unchanged.

No change to the success path or DB write order.

### 2. `src/pages/Accounts.tsx` — surface the suggestion

- When `smtp-test` returns `suggestedPort`/`suggestedSecure`, show a toast/confirm: "Connected on port 587 instead of 465. Save with the working settings?" — if accepted, patch `form` and proceed to insert.
- When the error includes provider-specific guidance, render it in `smtpError` exactly as returned (the field already supports any string).
- Add a small inline hint below the SMTP Host input for `secureserver.net` hosts: "GoDaddy: use smtpout.secureserver.net + port 587 (TLS off → STARTTLS). If your mailbox was migrated to Microsoft 365, use smtp.office365.com + 587."

## Out of scope

- No DB schema changes.
- No changes to `send-campaign`, `process-sequences`, `warmup-run`, or `_shared/send-email-internal.ts` — they keep using `smtp_secure` as the TLS source of truth.
- IMAP settings untouched.

## Verification

1. Ask the user for the exact host they entered (likely the wrong one) and confirm with `smtpout.secureserver.net`.
2. Re-test from the UI — expect either success on 465, or auto-fallback success on 587, or a clear actionable error explaining what to change.
3. New row appears in `email_accounts` for the new user.
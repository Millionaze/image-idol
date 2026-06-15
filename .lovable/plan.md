## What the screenshot tells us

The error displayed is:

> Connection failed: Connection reset by peer (os error 104)

That exact wording comes from the **previous** version of `supabase/functions/smtp-test/index.ts` (the old `catch` returned `` `Connection failed: ${connError.message}` ``). The new code I shipped last turn:

- Returns classified messages like *"Your provider reset the connection on port 465. This is common with GoDaddy on port 465 from cloud IPs..."*
- Automatically retries on **587 + STARTTLS** when 465 is reset, and if the retry succeeds, prompts the UI to save with those settings.

Since the user is still seeing the old message, the new `smtp-test` Edge Function either didn't redeploy or the user's browser hit it before the new version went live.

## Account-specific note

`mike@getpluggednetwork.com` on `smtpout.secureserver.net:465` is the classic GoDaddy-from-cloud-IP block. Port **587 with STARTTLS** is almost always the fix for this combination — exactly what the new fallback handles automatically.

## Plan

1. **Force-redeploy `smtp-test`.** Touch the file (a trivial comment edit) so Lovable picks up a new deploy, then verify via `edge_function_logs` that a new boot timestamp appears.
2. **No code logic changes** — last turn's implementation is correct. This is purely a redeploy/verification step.
3. **Ask the user to retry** after redeploy. Expected outcomes:
   - The function silently tries 465, fails with reset, retries 587+STARTTLS, succeeds, and the UI shows a confirm prompt: *"Port 465 was reset by smtpout.secureserver.net, but port 587 with STARTTLS worked. Save with these settings instead?"* → user clicks OK → account is saved.
   - Or, if 587 also fails, they see the new actionable error (specific GoDaddy guidance), not the raw `os error 104`.
4. **Immediate workaround** the user can do right now without waiting: change SMTP Port from `465` to `587` and toggle **Use TLS/SSL off**, then click Connect Account. That bypasses the 465 problem and uses STARTTLS, which GoDaddy reliably accepts.

## Out of scope

- No DB changes.
- No changes to send-campaign / process-sequences / warmup-run.
- IMAP settings (`imap.secureserver.net:993`) look correct — untouched.
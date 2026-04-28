# Why your emails are being marked "bounced"

## What I found

Looking at your `Agencies and Dentals` campaign (7 bounces, 0 sent) and the edge function logs:

1. **All 7 "bounced" contacts have `sent_at = null`** — meaning they never actually reached the recipient's mailserver. They were marked bounced before delivery.
2. **The Edge Function log shows the real error:**
   ```
   552: Message contains bare LF and is violating 822.bis section 2.3
   ```
   This is an SMTP server rejection caused by **stray `\n` characters (without `\r\n`) in the email body** — typically from pasting content from a rich-text editor or AI-generated copy. Once that error fires, denomailer reports `connection not recoverable`, so **every subsequent contact in the same batch fails too** and gets marked `bounced`.
3. **`send-campaign` treats every SMTP error as a bounce** — including auth failures, connection drops, malformed body, rate-limit, etc. A real "bounce" should only be a permanent recipient-side rejection (5xx on RCPT TO with codes like 550/551/553).

So the 7 "bounces" are almost certainly **not bad email addresses** — they're one bad message body taking down the whole batch, plus mis-classification.

## Plan

### 1. Sanitize the body before sending (fixes the 552 error)
In `supabase/functions/send-campaign/index.ts` (and `process-sequences/index.ts`, `_shared/send-email-internal.ts` if they share the issue), normalize line endings on subject + body before passing to denomailer:
- Replace lone `\n` and lone `\r` with proper `\r\n`
- Strip null bytes and other control chars
- Also add a `text` fallback (currently only `html` is set with `content: "auto"`)

### 2. Classify failures correctly (stop false bounces)
Inspect the SMTP error code/message in the catch block and set status accordingly:
- **`bounced`** — only for 550/551/553/554 with recipient-rejection wording ("user unknown", "no such user", "mailbox unavailable")
- **`failed`** — for 552 (message rejected), 421/45x (transient), auth errors, connection errors, malformed body
- Keep `pending` (with retry) for transient 4xx so the contact isn't burned

This requires a new `failed` value on the `contact_status` enum (or reuse `pending` with a retry counter — I'll check the enum and pick the cleaner option).

### 3. Stop the cascade after a connection-level failure
When denomailer reports `connection not recoverable`, break out of the loop and re-open the SMTP client for the next batch instead of marking every remaining contact as bounced.

### 4. Reset the 7 falsely-bounced contacts
Update those 7 rows back to `pending` and decrement `bounce_count` on the campaign so you can re-send them after the fix ships.

### 5. Surface the real error to the UI
Store the SMTP error message on the contact (or in `events.payload`, which already happens) and show it in the Campaign detail view so you can tell "bad address" apart from "bad message" next time.

## Out of scope
- DNS/SPF/DKIM issues — your other campaigns (Freight 1, Freight 35-48) sent successfully from the same `bizboostai.space` domain, so deliverability infra is fine.
- Resend/Lovable Email — you're sending via your own SMTP (`mail.privateemail.com`, `smtpout.secureserver.net`), not a managed provider.

Approve and I'll implement steps 1–5.

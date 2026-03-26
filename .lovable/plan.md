
# Fix unreadable “random code” in received emails

## Why this is happening
The inbox sync currently fetches `BODY[TEXT]` from IMAP and stores it directly in `inbox_messages.body` (`supabase/functions/inbox-sync/index.ts`).  
For multipart emails, that payload includes MIME boundaries and part headers (`Content-Type`, `Content-Transfer-Encoding`, etc.), so the UI shows protocol text instead of a clean message.

## Implementation plan (step-by-step)

1. **Improve IMAP fetch payload**
   - Keep current UID flow, but fetch enough content to parse MIME reliably (raw message body + headers per message part).
   - Continue batching to stay within Edge Function timeout.

2. **Add MIME parsing in `inbox-sync`**
   - Parse message headers/body boundary.
   - Detect multipart (`multipart/alternative`, `multipart/mixed`) and extract the best readable part:
     - Prefer `text/plain`
     - Fallback to `text/html` converted to plain text if plain part is missing
   - Ignore attachment parts.

3. **Decode transfer encodings**
   - Decode `quoted-printable` and `base64` body content before saving.
   - Respect charset when possible (default UTF-8 fallback).

4. **Decode human-facing headers**
   - Decode RFC 2047 encoded words in `Subject` and `From` so names/subjects are readable.

5. **Store cleaned content**
   - Save only cleaned body text to `inbox_messages.body`.
   - Keep `message_uid` dedupe logic.

6. **Repair already-synced messages**
   - Add a one-time “reprocess recent messages” sync mode (manual sync path) so old MIME-coded entries are rewritten with parsed body text.
   - Ensure upsert updates existing rows on `account_id,message_uid` instead of skipping duplicates for repair runs.

7. **Frontend safeguard (optional but recommended)**
   - Add a lightweight display fallback in Unibox/Inbox to hide obvious MIME artifacts if parsing ever fails (prevents raw protocol dump in UI).

## Technical details
- **Primary file:** `supabase/functions/inbox-sync/index.ts`
- **Likely UI files (fallback only):** `src/pages/Unibox.tsx`, `src/pages/Inbox.tsx`
- **No major schema change required** for the core fix (unless we choose to keep raw body separately for debugging).

## Validation (end-to-end)
1. Sync an account with known multipart + quoted-printable emails.
2. Confirm body shows readable text (no boundary markers / MIME headers).
3. Confirm subject/from render decoded values.
4. Run manual repair sync and verify previously broken messages are corrected.
5. Verify full flow end-to-end in Unibox (sync → list → open message → readable content).

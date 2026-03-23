

# Fix SMTP Test — Robust Authentication

## Root Cause

The manual SMTP handshake in `smtp-test/index.ts` has three issues:
1. EHLO responses are multi-line (e.g., 10+ lines of `250-...`). A single 2048-byte read may not consume all of them, so the next `read()` for AUTH gets leftover EHLO data instead of the `334` prompt.
2. Port 587 requires STARTTLS before AUTH — the code never sends STARTTLS, so the server rejects AUTH attempts on the unencrypted connection.
3. Some servers only support AUTH PLAIN, not AUTH LOGIN.

## Fix (`supabase/functions/smtp-test/index.ts`)

Rewrite the SMTP handshake to:
1. **Fully drain multi-line responses** — read in a loop until the response contains a line starting with `250 ` (space, not dash), indicating the final line of the EHLO response.
2. **Implement STARTTLS for port 587** — after EHLO, check if the response includes `STARTTLS`. If so, send `STARTTLS`, wait for `220`, then upgrade the connection using `Deno.startTls()`. Then re-send EHLO on the upgraded connection.
3. **Try AUTH PLAIN as fallback** — if AUTH LOGIN returns an error (e.g., `504`), fall back to AUTH PLAIN (`\0username\0password` base64-encoded).
4. **Add console.log** for debugging — log the greeting, EHLO response, and AUTH response so failures show up in edge function logs.

## Files Changed

| File | Action |
|------|--------|
| `supabase/functions/smtp-test/index.ts` | Rewrite with STARTTLS + AUTH PLAIN fallback + proper response draining |


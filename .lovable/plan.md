

# Fix SMTP Test Edge Function

## Problem
The `smtp-test` function creates an `SMTPClient` but never calls `connectTLS()` or `connect()`. The `close()` call then fails with "Cannot read properties of undefined (reading 'close')" because no connection exists.

## Fix (`supabase/functions/smtp-test/index.ts`)
Replace the current approach with a proper connection test:
1. Create `SMTPClient` with connection config
2. Call `await client.connectTLS()` (for TLS) or `await client.connect()` (for non-TLS) to actually establish the SMTP connection
3. If connection succeeds, call `await client.close()` to clean up
4. Wrap in try/catch — connection failure = bad credentials or wrong host/port

Alternative simpler approach: Use Deno's built-in `Deno.connect`/`Deno.connectTls` to test TCP connectivity to the SMTP server, which avoids the denomailer library issues entirely. This is more reliable since we only need to verify the server is reachable and accepts connections.

## Files Changed
| File | Action |
|------|--------|
| `supabase/functions/smtp-test/index.ts` | Fix connection test logic |


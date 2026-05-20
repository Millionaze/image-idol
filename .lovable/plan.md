# Public API for Campaigns & Sending

Add a minimal, documented REST API so external systems can programmatically create campaigns (bound to warmed-up email accounts) and send emails — authenticated by per-user API keys.

## Scope

In:
- API key issuance & revocation (UI in Settings)
- One public edge function exposing 4 endpoints
- Docs page with curl examples

Out (can come later):
- Webhooks for delivery events (already exists separately)
- Per-key rate limiting beyond a simple per-minute counter
- OAuth, granular scopes

## Database

New table `api_keys`:
- `id`, `user_id`, `name` (label like "Zapier"), `key_prefix` (e.g. `pg_live_abc12345` — shown in UI), `key_hash` (sha256 of full key, only thing stored), `last_used_at`, `revoked_at`, `created_at`
- RLS: users manage only their own rows
- Full key shown **once** at creation time, then never again

## Edge Function: `public-api` (verify_jwt = false)

Path-based router. Auth via `Authorization: Bearer pg_live_...` → hash → lookup in `api_keys` → resolve `user_id` → use service role scoped to that user.

Endpoints:

1. **`GET /v1/accounts`**
   List user's email accounts with `id`, `email`, `warmup_enabled`, `reputation_score`, `status`. Lets the caller pick a warmed-up sender.

2. **`POST /v1/campaigns`**
   Body: `{ name, account_id, subject, body, daily_limit?, sequences?: [{ step_number, subject, body, delay_days }] }`
   Validates `account_id` belongs to user and ideally has `warmup_enabled = true` and `reputation_score >= 50` (warning, not block — configurable). Returns campaign `id`.

3. **`POST /v1/campaigns/:id/contacts`**
   Body: `{ contacts: [{ email, name? }] }` (max 1000 per call). Bulk insert into `contacts` table.

4. **`POST /v1/campaigns/:id/launch`**
   Flips status `draft → active` and invokes the existing `send-campaign` / `process-sequences` machinery — no duplication of sending logic.

5. **`POST /v1/emails/send`** (one-off, no campaign)
   Body: `{ account_id, to, subject, html }`. Calls existing `sendEmailViaAccount` helper. Useful for transactional sends from a warmed-up inbox.

All responses JSON; errors `{ error: { code, message } }`; consistent 400 / 401 / 404 / 429.

## Rate limiting (simple)

In-memory map keyed by `key_id` → 60 req/min. Returns 429 with `Retry-After`. Good enough for v1; can upgrade to a DB counter later.

## Frontend

- **Settings → API Keys** tab: list keys (name, prefix, last used), "Create key" button → modal shows full key once with copy button, "Revoke" action.
- **Settings → API Docs** subpage (or `/api-docs`): curl examples for each endpoint, base URL `https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/public-api`.

## Technical notes

- Key format: `pg_live_` + 32 hex chars. Store only `sha256(fullKey)` in `key_hash`.
- Update `last_used_at` async (don't block request).
- Add `public-api` to `supabase/config.toml` with `verify_jwt = false`.
- Reuse `supabase/functions/_shared/send-email-internal.ts` for the one-off send endpoint.
- Launch endpoint reuses existing `send-campaign` invocation pattern (no logic duplication).

## Deliverables

1. Migration: `api_keys` table + RLS
2. Edge function: `supabase/functions/public-api/index.ts` + config.toml entry
3. UI: `src/components/settings/ApiKeysPanel.tsx` mounted in Settings
4. Docs page: `src/pages/ApiDocs.tsx` with copy-able curl snippets

Approve and I'll build it.
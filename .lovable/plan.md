## Why signatures aren't saving

There is no signature field anywhere — not in the `email_accounts` table, not in `campaigns`, and not in the Accounts or Campaigns UI. So whatever the user is typing has nowhere to go; on refresh it disappears. This isn't a save bug, it's a missing feature.

## Plan — Add signatures

### 1. Database
Add two columns to `email_accounts`:
- `signature_html text` — rich HTML signature (used for HTML campaigns / replies)
- `signature_plain text` — plain text version (used for Plain campaigns)

Both nullable, default null. No RLS changes needed (existing per-user policy covers it).

### 2. Accounts UI (`src/pages/Accounts.tsx`)
In both the **Add** and **Edit** dialogs, add a new "Signature" section under the credentials block:
- Tabs: **Plain** | **HTML**
- Plain tab: `<Textarea>` (5 rows), monospace hint
- HTML tab: reuse the existing `RichTextEditor` from `src/components/shared/RichTextEditor.tsx`
- Helper text: "Appended to the bottom of every email sent from this account. Merge tags like `{{first_name}}` work."
- Small "Sync from HTML → Plain" button that strips tags into the plain field so users only maintain one

Wire into `saveAccount` / `saveEdit` payloads.

### 3. Sending pipeline
Append the correct signature just before the send in all three paths:
- `supabase/functions/send-campaign/index.ts`
- `supabase/functions/process-sequences/index.ts`
- `supabase/functions/send-reply/index.ts`

Rules:
- `email_type === 'plain'` → append `\n\n{signature_plain}` to text body
- `email_type === 'html'` (or reply) → append `<br><br>{signature_html}` to HTML body, and the stripped version to the text alternative
- If the corresponding signature field is empty, skip (don't append the other type)
- Merge-tag substitution runs on the signature the same way it runs on the body

### 4. Campaign preview
On the Campaigns compose screen, show a small muted "— signature will be appended from account —" hint under the body editor so users understand where it comes from and don't paste it into every campaign.

## Separately — the "users can't log in" issue

Auth logs show `403 bad_jwt / invalid claim: missing sub claim` on `/auth/v1/user`. That means affected browsers have a **stale Supabase session in localStorage** (left over from the Supabase key rotation visible in the project's secrets). The session token is malformed for the current JWT signing key, so `getUser()` 403s forever and `ProtectedRoute` bounces them.

Fix in `src/contexts/AuthContext.tsx`:
- In the initial `getSession()` handler, also call `supabase.auth.getUser()`. If it returns an `AuthApiError` with `bad_jwt` / `invalid claim`, call `supabase.auth.signOut({ scope: 'local' })` and clear the `sb-*-auth-token` key from localStorage before setting `loading = false`.
- In `onAuthStateChange`, on `TOKEN_REFRESHED` failure (`session === null` while previously set), do the same local cleanup so a bad refresh boots them to `/login` cleanly instead of blank-screening.

This makes affected users land on `/login` on next page load and lets them sign in normally, instead of being stuck.

## Not changing
- SMTP/IMAP config, sending logic beyond the signature append, warmup, inbox sync, workflow engine.

## Files touched
- Migration: add 2 columns to `email_accounts`
- `src/pages/Accounts.tsx` — signature tabs in Add + Edit dialogs
- `src/pages/Campaigns.tsx` — one hint line under body editor
- `src/contexts/AuthContext.tsx` — bad_jwt recovery
- `supabase/functions/send-campaign/index.ts`
- `supabase/functions/process-sequences/index.ts`
- `supabase/functions/send-reply/index.ts`

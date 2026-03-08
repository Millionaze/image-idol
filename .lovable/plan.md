

# Remaining 4 Features — Implementation Plan

## Feature 2: Blacklist Monitoring

**Edge function: `check-blacklist`** (new)
- Accepts `{ domain }`, does DNS lookups against 5 DNSBL servers using Google DNS API (same pattern as check-dns)
- For each DNSBL, queries `REVERSED_IP.dnsbl_zone` — but since we have domains not IPs, first resolve the domain's MX/A record to get an IP, then reverse it
- Fallback: if IP resolution fails, return "unable to check" rather than failing
- Returns `{ is_clean, listed_on: string[] }`

**Frontend (Accounts page):**
- Add "Check Blacklists" button per account card
- Show result: green "Clean" or red warning with listed blacklists
- Store result in `blacklist_checks` table (already exists)
- If any account is blacklisted, show persistent red banner at top of Accounts page
- Factor blacklist status into deliverability score: +15 points if clean (adjust from current 25 for reputation to 10, keeping total at 100)

**Config:** Add `[functions.check-blacklist]` to config.toml

---

## Feature 5: Custom Tracking Domain

**Settings page updates:**
- Add "Tracking Domain" card with input for custom subdomain (e.g. `track.yourdomain.com`)
- Show CNAME instructions: point to `ivyqkprlrosapkmmwkeh.supabase.co`
- "Verify" button that fetches `https://CUSTOM_DOMAIN/functions/v1/track-open` to confirm it resolves
- Save to `settings` table (tracking_domain, tracking_domain_verified columns already exist)
- Replace localStorage-based tracking URL with DB-backed settings

**send-campaign update:**
- Query user's settings for tracking_domain
- If set and verified, use `https://CUSTOM_DOMAIN/functions/v1/track-open?id=ID` instead of default URL

---

## Feature 7: Inbox Placement Tester

**New tables needed:** `placement_tests` and `placement_results` (already created in migration)

**Settings page:** Add "Seed Accounts" card — 3 inputs for Gmail, Outlook, Custom seed emails, saved to settings table (columns already exist)

**Campaigns/Accounts page:** Add "Test Inbox Placement" button opening a modal:
- Select sending account, enter test subject/body
- Click "Run Test" → calls send-campaign logic to send to 3 seed addresses
- Creates `placement_tests` row and 3 `placement_results` rows (status: pending)

**Results UI:** After test, show results table with provider | result columns. User clicks "Mark Result" to set inbox/spam/promotions per row. Show history of past tests per account.

**Note:** Since we can't auto-detect inbox placement without IMAP access to seed accounts, this uses manual marking (same as most competitors at this price point).

---

## Feature 8: AI-Generated Warmup Content

**Approach:** Use Lovable AI Gateway (LOVABLE_API_KEY already available) instead of Anthropic API — no additional secrets needed.

**New edge function: `generate-warmup-content`**
- Calls `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-2.5-flash-lite` (cheapest/fastest)
- System prompt for body: "Generate a short, casual, natural-sounding business email. 2-4 sentences, friendly tone. Never mention products or marketing. Return only the email body."
- System prompt for subject: "Generate a short casual email subject line (4-7 words). Return only the subject line."
- Returns `{ subject, body }`

**warmup-run update:**
- Before sending, check if sender's user has `ai_warmup_enabled = true` in settings
- If yes, call generate-warmup-content for unique content
- Wrap in try/catch, fall back to hardcoded pool on failure

**Settings page:** Add "AI Warmup Content" toggle card (saves to settings.ai_warmup_enabled)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | New tables: placement_tests, placement_results (if not yet created) |
| `supabase/functions/check-blacklist/index.ts` | Create |
| `supabase/functions/generate-warmup-content/index.ts` | Create |
| `supabase/functions/warmup-run/index.ts` | Edit (AI content integration) |
| `supabase/functions/send-campaign/index.ts` | Edit (custom tracking domain) |
| `supabase/config.toml` | Edit (add new functions) |
| `src/pages/Accounts.tsx` | Edit (blacklist UI, placement test button) |
| `src/pages/Settings.tsx` | Edit (tracking domain, seed accounts, AI toggle) |
| `src/pages/Campaigns.tsx` | Edit (placement test button) |
| `src/components/BlacklistStatus.tsx` | Create |
| `src/components/PlacementTestModal.tsx` | Create |


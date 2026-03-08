

# MailForge — Completion Plan

## Current State Summary

After reviewing all files, here's what's broken or missing:

1. **Database trigger + RLS**: The context shows "no triggers" and all policies still RESTRICTIVE — the previous migration may not have applied. Needs re-verification and re-application.
2. **Edge functions**: `getClaims()` (non-existent API) is still in `send-campaign`, `warmup-run`, and `inbox-sync` — these will crash at runtime.
3. **Dashboard**: Chart uses `Math.random()` mock data instead of real warmup_logs.
4. **Accounts**: Save doesn't gate on SMTP test — user can save broken credentials.
5. **Campaigns contact panel**: No open rate %, no progress bar.
6. **Inbox**: Doesn't mark messages as read on click.
7. **Settings page**: Doesn't exist yet.
8. **Global**: No skeleton loading states on page load.

## Implementation Plan

### Phase 1 — Database (1 migration)

Re-apply trigger + convert all RLS policies to PERMISSIVE (same SQL as before, guarded with `IF EXISTS` drops).

### Phase 2 — Edge Functions (3 files)

Fix `getClaims()` → `getUser()` in:
- `send-campaign/index.ts` — also fix `{{name}}` fallback to use email prefix when name is empty
- `warmup-run/index.ts` — keep auth optional for cron calls
- `inbox-sync/index.ts` — expand demo messages to 6 varied samples

### Phase 3 — Frontend (7 files)

**Dashboard.tsx**
- Replace random `chartData` with real query: warmup_logs grouped by date for last 7 days
- Show zero line when no data

**Accounts.tsx**  
- Gate `saveAccount` on successful SMTP test first — show "Testing connection..." → "Saving..." flow
- Show inline error if test fails, don't save

**Campaigns.tsx**
- Add open rate % and mini progress bar (green >30%, yellow 10-30%, red <10%) to contact Sheet header
- Add Eye icon to opened status badges

**Inbox.tsx**
- Mark message as read (`is_read = true`) on click
- Add skeleton loader while messages load

**Settings.tsx** (new)
- Profile section: display name edit, save to profiles table
- Tracking URL section: input stored in localStorage, defaults to project edge function URL
- Danger zone: delete all campaigns / delete all accounts with confirmation dialogs

**AppSidebar.tsx** — Add Settings nav item  
**App.tsx** — Add `/settings` route

### Phase 4 — Global Polish

- Add `Skeleton` loading states to Dashboard, Accounts, Warmup, Campaigns, Inbox during initial data fetch
- Wrap all Supabase queries in try/catch with toast error feedback

### Files Changed

| File | Action |
|------|--------|
| 1 migration SQL | Create (trigger + RLS) |
| `send-campaign/index.ts` | Edit (getClaims → getUser, name fallback) |
| `warmup-run/index.ts` | Edit (getClaims → getUser) |
| `inbox-sync/index.ts` | Edit (getClaims → getUser, more demo messages) |
| `src/pages/Dashboard.tsx` | Edit (real chart data) |
| `src/pages/Accounts.tsx` | Edit (SMTP-gate save) |
| `src/pages/Campaigns.tsx` | Edit (open rate bar) |
| `src/pages/Inbox.tsx` | Edit (mark read, skeleton) |
| `src/pages/Settings.tsx` | Create |
| `src/components/AppSidebar.tsx` | Edit (add Settings link) |
| `src/App.tsx` | Edit (add route) |

No table schema changes needed — all existing tables are sufficient.


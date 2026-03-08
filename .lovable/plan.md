

# What's Left to Build

After reviewing the full codebase, the UI and edge functions are all in place. The remaining issues are **critical backend bugs** and **missing infrastructure** that prevent the app from actually working.

## 1. Missing Database Trigger (Critical)

The `handle_new_user()` function exists but **no trigger is attached to `auth.users`**. Registration will fail silently — no profile row gets created, and all RLS-protected queries will return empty.

**Fix**: Create the trigger via migration:
```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## 2. All RLS Policies Are RESTRICTIVE (Critical)

Every RLS policy is set to `RESTRICTIVE` (Permissive: No). In Postgres, if there are **only** restrictive policies and **no** permissive policies, all access is denied. This means every query from the frontend returns empty results.

**Fix**: Drop all 8 existing policies and recreate them as PERMISSIVE (the default). This affects: `email_accounts`, `campaigns`, `contacts`, `warmup_logs`, `inbox_messages`, `profiles`.

## 3. Edge Functions Use Non-Existent `getClaims()` API

`warmup-run`, `send-campaign`, and `inbox-sync` call `supabase.auth.getClaims()` which doesn't exist in `@supabase/supabase-js`. This will throw a runtime error.

**Fix**: Replace with `supabase.auth.getUser()` in all three edge functions.

## 4. CORS Headers Incomplete

Edge function CORS headers are missing required Supabase client headers (`x-supabase-client-platform`, etc.).

**Fix**: Update CORS headers in all 4 CORS-enabled edge functions to include the full set.

## 5. Cron Jobs Not Configured

The plan calls for two pg_cron jobs:
- **Warmup cycle**: Every 2 hours Mon–Fri 9am–5pm
- **Daily reset**: Midnight — reset `warmup_sent_today` to 0

**Fix**: Enable `pg_cron` and `pg_net` extensions via migration, then insert cron schedules via the SQL insert tool.

## 6. Minor Edge Function Improvements

- `send-campaign`: Uses user-scoped client for DB writes, but contacts/campaigns have restrictive RLS — after fixing RLS to permissive, this will work. Also should use `supabaseAdmin` for campaign status updates to avoid race conditions.
- `warmup-run`: The auth check is broken (getClaims) but also unnecessary for cron-triggered calls — simplify to just check if auth header exists and validate with `getUser()`.

## Implementation Order

1. **Migration**: Add trigger + recreate all RLS policies as PERMISSIVE + enable pg_cron/pg_net extensions
2. **Edge functions**: Fix `getClaims` → `getUser()`, update CORS headers in all 5 functions
3. **Cron jobs**: Insert via SQL insert tool (not migration) since they contain project-specific URLs/keys
4. **Deploy**: Edge functions auto-deploy on save

## Estimated Changes

- 1 database migration (trigger + RLS fix + extensions)
- 1 SQL insert (cron jobs)
- 5 edge function file updates (CORS + auth fix)
- No frontend changes needed — UI is complete


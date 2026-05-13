## Plan: Fix DKIM Selector Detection for GoDaddy/Titan Email

### Problem
The `check-dns` edge function scans a hardcoded list of common DKIM selectors. It currently misses GoDaddy Titan Email selectors, causing false negatives for domains hosted on that platform.

### Current State
File: `supabase/functions/check-dns/index.ts` (lines 31-52)

Already present in `DEFAULT_SELECTORS`:
- `protonmail`, `protonmail2`, `protonmail3` ✅
- `zoho`, `zmail` ✅
- `mxvault` ✅

Missing:
- `secureserver1`, `secureserver2` (GoDaddy Titan Email)
- `titanmail` (Titan non-GoDaddy)

### Change
In `supabase/functions/check-dns/index.ts`, append the following selectors to the `DEFAULT_SELECTORS` array:

```typescript
  // GoDaddy / Titan Email
  "secureserver1", "secureserver2", "titanmail",
```

Placement: after the existing `// GoDaddy / SecureServer / Namecheap PrivateEmail` section (line 38), before the `// Google Workspace` section.

### After Fix
Re-running domain health on a GoDaddy Titan Email domain will query `secureserver1._domainkey.<domain>` and `secureserver2._domainkey.<domain>`, correctly detecting the CNAME-based DKIM records.

### Scope
- Backend only (edge function). No UI changes.
- No database changes.
- No new dependencies.

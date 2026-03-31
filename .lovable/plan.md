

# Rename "MailForge" → "Pixel Growth"

Simple find-and-replace across 5 files:

| File | Change |
|------|--------|
| `src/pages/Login.tsx` | `Mail<span className="text-primary">Forge</span>` → `Pixel<span className="text-primary"> Growth</span>` |
| `src/pages/Register.tsx` | Same branding update |
| `src/components/AppSidebar.tsx` | Same branding update |
| `src/pages/tools/AuditReport.tsx` | Replace "MailForge Audit Report" and "MailForge Deliverability Audit" with "Pixel Growth" equivalents |
| `supabase/functions/smtp-test/index.ts` | Change EHLO identifier from `mailforge` to `pixelgrowth` |
| `index.html` | Update `<title>` and OG meta tags from "Lovable App" to "Pixel Growth" |

The Flame icon on login/register/sidebar will be kept as-is unless you want a different icon.


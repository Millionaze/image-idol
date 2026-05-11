# Why DKIM shows red even though you configured it

The Domain Health panel polls Google's public DNS for your DKIM record, but it only knows about a tiny hardcoded list of selectors:

`google, default, mail, selector1, selector2, k1`

A DKIM record lives at `<selector>._domainkey.<domain>`. If your provider uses a selector that isn't in that list, the checker can't find it — even though the record is published correctly. GoDaddy / Microsoft 365 / SecureServer mailboxes commonly use selectors like `s1`, `s2`, `protonmail`, `mxvault`, `dkim`, `smtpapi`, `zoho`, `everlytic`, and dozens of others, none of which we currently probe.

So the red "DKIM ✗" badge on `millionaze.net` almost certainly means **"we couldn't guess your selector"**, not "DKIM is missing."

## Plan

### 1. Expand the built-in selector list in `check-dns`
Add the common ones used by every major provider:
- `s1`, `s2` (GoDaddy/SecureServer, Namecheap)
- `protonmail`, `protonmail2`, `protonmail3` (Proton)
- `mxvault` (MXroute)
- `zoho`, `zmail` (Zoho)
- `dkim`, `dkim1`, `dkim2` (generic / Fastmail)
- `mandrill`, `mailjet`, `smtpapi`, `sendgrid`, `scph0820`, `scph1020` (ESPs)
- `key1`, `key2` (Mailgun)
- `everlytic`, `pm`, `litmus`, `1`, `2`
- `mta1`, `mta2` (Amazon SES style)

This alone should auto-detect most users.

### 2. Let the user store a custom selector per domain
Add an optional `dkim_selector` field on the account/domain record. If present, `check-dns` checks that selector **first** and trusts it.

UI change: in the DnsHealthPanel "How to fix" expander for DKIM, add a small input — "Already configured? Enter your DKIM selector" — that saves it and re-runs the check. So if your provider tells you the selector is e.g. `s1024`, you punch it in once and the badge turns green.

### 3. Surface the actual lookup attempt on failure
When DKIM fails, return the list of selectors that were tried so the panel can say:
> "Checked 18 common selectors at `*._domainkey.millionaze.net` — none returned a record. If you've configured DKIM, enter your selector below."

Much better UX than a silent red X.

### 4. (Optional) Cache and reuse the discovered selector
Once a selector resolves successfully for a domain, persist it on the account row so future checks skip the brute-force loop and are instant.

## Files touched

- `supabase/functions/check-dns/index.ts` — expand selector list, accept `selector` in request body, return `tried_selectors` on failure
- `src/components/DnsHealthPanel.tsx` — custom-selector input in the DKIM "How to fix" panel, show tried selectors
- One small migration to add `dkim_selector text` to the relevant accounts/domain table (only if you want step 2 + 4)

## Out of scope

- No change to the actual sending pipeline or warmup
- No change to SPF/DMARC checks
- No automated DKIM provisioning (still requires the record to exist at your DNS host)

Want me to do all four steps, or just steps 1 + 3 (no schema change, just better detection + clearer error)?

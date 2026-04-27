# Fix: Domain Health score resets on reload

## What's actually happening

There are **two different scores** on each account card:

- **Reputation bar (the "25")** — stored in `email_accounts.reputation_score`. Set by the warmup engine. A new/cold account stays at a low default. This is what you're seeing on reload.
- **Deliverability ring (jumps to ~75–100)** — recomputed live from DNS results + blacklist + reputation. DNS results are only fetched when you click "Show Domain Health", and they're held in **component state only** — never saved. So every page reload wipes them, and the ring drops back to a baseline.

Result: clicking the button looks like it "fixes" the score, but reloading throws away the DNS data and it falls back.

## Fix

### 1. Persist DNS results to the database
- The `dns_health_log` table already exists (with `domain`, `spf_status`, `dkim_status`, `dmarc_status`, `checked_at`).
- Update the `check-dns` edge function to **insert a row** into `dns_health_log` after every successful check.
- On `Accounts.tsx` mount, query the latest row per domain from `dns_health_log` and seed `dnsResults` so the ring shows the cached score immediately — no click required.

### 2. Auto-check DNS on first page load
- For any account whose domain has **no recent (`<24h`) entry** in `dns_health_log`, fire a background `check-dns` call automatically. This way new users see a real score on first visit, not a default-low one.

### 3. Clarify the two scores in the UI
- Add a small tooltip/info icon next to the **Reputation bar** explaining: "Sender reputation, built up through warmup activity. Low for new accounts."
- Add the same on the **Deliverability ring**: "Combines DNS health (SPF/DKIM/DMARC), blacklist status, and reputation."
- This prevents the "why are there two different numbers" confusion.

### 4. Fix the unrelated console warnings
While in the area, wrap `DnsHealthPanel` and `PlacementTestModal` in `React.forwardRef` (or strip the implicit ref) — they're triggering "Function components cannot be given refs" warnings that show up in the logs.

## Technical notes

- `dns_health_log` already has RLS allowing all authenticated users to SELECT, and service-role for inserts. The edge function uses the service role, so inserts work without policy changes.
- DNS cache lookup on mount: one query `SELECT DISTINCT ON (domain) ...` filtered by the domains of the user's accounts.
- No new tables, no migrations needed.

## Files to change

- `supabase/functions/check-dns/index.ts` — insert into `dns_health_log` after check
- `src/pages/Accounts.tsx` — load cached DNS on mount, auto-check stale domains, add info tooltips
- `src/components/DnsHealthPanel.tsx` — `forwardRef` wrap
- `src/components/PlacementTestModal.tsx` — `forwardRef` wrap

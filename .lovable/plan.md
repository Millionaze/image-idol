

# Warmup Feature Overhaul

This is a large feature set spanning 7 major areas. The implementation will be broken into new components and a complete rewrite of the Warmup page. All UI uses the existing dark theme (`#0a0a0f` background, orange `hsl(18,100%,60%)` accent).

**No database schema changes needed** — all data derives from existing tables: `email_accounts`, `warmup_logs`, `blacklist_checks`, `settings`. Warmup readiness scores and alerts are computed client-side from this data.

---

## File Structure

```text
src/pages/Warmup.tsx                          — Full rewrite (dashboard)
src/components/warmup/
  WarmupAccountCard.tsx                       — Per-account progress card (#2)
  WarmupScheduleChart.tsx                     — 14-day past + 14-day projected bar chart (#3)
  WarmupAlertsPanel.tsx                       — Smart alerts (#4)
  WarmupReadinessModal.tsx                    — Readiness score modal/drawer (#5)
  WarmupSettingsDrawer.tsx                    — Per-account settings drawer (#6)
  WarmupReputationChart.tsx                   — 30-day reputation line chart (#1)
  WarmupGateModal.tsx                         — Campaign warmup gate warning (#7)
src/pages/Campaigns.tsx                       — Add gate check before send (#7)
```

---

## 1. Warmup Dashboard Page (`Warmup.tsx` rewrite)

- **Top stats row**: 4 summary cards — Total Accounts Warming, Avg Reputation, Emails Sent Today, Accounts Ready
- **Reputation line chart** (Recharts `LineChart`): plots `reputation_score` from `warmup_logs` over 30 days; orange line on dark background
- **Warmup Readiness Badges** per account: computed from reputation_score + ramp_day + warmup_enabled:
  - `< 30 rep, not enabled` → "Not Ready" (red)
  - `enabled, ramp_day < 21` → "Warming Up" (yellow)  
  - `rep >= 70, ramp_day >= 21` → "Ready for Campaigns" (green)
  - `rep >= 70, ramp_day >= 30` → "Maintenance Mode" (blue)
- **Daily volume tracker**: bar showing `warmup_sent_today` vs daily target per account
- Account cards grid below (component #2)
- Alerts panel (#4) and schedule chart (#3) sections

## 2. Per-Account Warmup Progress Card

Each card includes:
- Email + provider icon (detect Gmail/Outlook/Custom from `smtp_host`)
- Horizontal `Progress` bar: `(ramp_day / 30) * 100`
- "Day X of 30" label + estimated completion date
- Current send volume: `ramp_day * 2` → `warmup_daily_limit`
- Inbox placement % (computed from `warmup_logs` sent vs rescued_from_spam ratio)
- Action buttons: Pause/Resume (toggle `warmup_enabled`), Boost (bump `warmup_daily_limit`), Settings (open drawer #6)
- Status chip: Healthy (green, rep≥70), At Risk (yellow, rep 40-69), Paused (gray, !enabled)

## 3. Warmup Schedule Visualizer

- Recharts `BarChart` with 28 bars (14 past + 14 projected)
- Past bars: count `warmup_logs` per day for last 14 days
- Projected bars: lighter/dashed opacity, calculated from current ramp trajectory
- Annotations for pauses (days with 0 volume while enabled) shown as red dots

## 4. Smart Alerts Panel

- Client-side computed alerts from data:
  - Spam rate > 3%: count `rescued_from_spam` logs vs total → auto-pause warning
  - Account ready: rep ≥ 70 + ramp_day ≥ 21 → "Ready for campaigns!"
  - DNS issues: cross-reference with DNS health check results
- Each alert: icon, message, timestamp, CTA button (Fix Now → navigate to Accounts, Start Campaign → navigate to Campaigns, Dismiss → local state)

## 5. Warmup Readiness Score Modal

- Opens when clicking an account card
- Large `DeliverabilityRing` (size=160) with overall readiness score
- Breakdown: Gmail Inbox Rate, Outlook Inbox Rate, Reply Rate, Spam Rate, DNS Health — each as a labeled progress bar
- "What to do next" section with 2-3 contextual tips based on lowest scores
- "Graduate to Campaign" button — disabled if score < 70, links to `/campaigns`

## 6. Warmup Settings Drawer

- `Sheet` component, opens per account
- Daily volume `Slider` (2–100) with ramp preview text
- Warmup persona `Select`: "Startup Founder" | "Agency" | "SaaS Sales" | "Recruiter" (stored in `email_accounts` — needs a new column OR use localStorage for now)
- Toggles: Maintenance mode, Auto-pause if spam > 5%, Use spintax
- Sending hours: two `Select` dropdowns for start/end hour
- All settings save to `email_accounts` columns where possible; new fields stored in localStorage until schema is extended

## 7. Campaign Warmup Gate

- In `Campaigns.tsx`, before `sendCampaign()`, compute the account's warmup readiness
- If score < 70, show `WarmupGateModal` with warning message and two buttons
- "Wait and continue warming up" → dismiss
- "Proceed anyway" → continue with send

---

## Technical Details

- **Charts**: Use Recharts (already a dependency) with `CartesianGrid stroke="#1a1a1a"`, orange (`hsl(18,100%,60%)`) for primary lines/bars
- **Provider detection**: `smtp_host.includes('gmail') → Gmail icon`, `outlook → Outlook icon`, else generic Mail icon
- **Readiness score formula**: `(reputation_score * 0.4) + (inbox_rate * 0.3) + (dns_health * 0.2) + (ramp_progress * 0.1)` — all computed client-side
- **No new DB migrations needed** for core features; persona/maintenance-mode preferences stored in localStorage as a JSON map keyed by account ID
- **Loading states**: Skeleton components for all data-dependent sections
- **Empty state**: "Connect an account to start warming up →" with link to `/accounts`


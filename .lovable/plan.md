

# MailForge Advanced Features — Implementation Plan

This covers 8 features (grouped from your 4 selections): DNS Health, Deliverability Score, Slow Ramp Warmup, Behavioral Warmup Signals, Email Sequences, Campaign Analytics, and Unibox. Due to the massive scope, implementation will be split into 3 passes.

---

## Pass 1: Database + Edge Functions + DNS Health + Deliverability Score

### Database Migration

**New tables:**
- `settings` — user_id (unique), tracking_domain, tracking_domain_verified, ai_warmup_enabled, seed_gmail, seed_outlook, seed_custom
- `blacklist_checks` — id, account_id, checked_at, is_clean, listed_on (text[])
- `sequence_steps` — id, campaign_id, step_number, subject, body, delay_days, delay_hours
- `contact_sequence_state` — id, contact_id, campaign_id, current_step, next_send_at, status (enum: active/completed/paused)

**New columns on existing tables:**
- `email_accounts`: warmup_ramp_day (int default 0), warmup_start_date (timestamptz), warmup_weekdays_only (bool default true), mark_important_rate (int default 30), spam_rescue_rate (int default 20)
- `campaigns`: is_sequence (bool default false)

**New enum values:**
- Add `marked_important` and `rescued_from_spam` to `warmup_log_type`
- Add `replied` to `contact_status`
- Create `sequence_state_status` enum: active, completed, paused

**RLS policies** for all new tables scoped to user via joins (same pattern as existing).

### Edge Function: `check-dns`
- Accepts `{ domain }`, calls Google DNS-over-HTTPS for SPF, DMARC, DKIM (selectors: google, default, mail)
- Returns `{ spf: bool, dkim: bool, dmarc: bool, details: {...} }`
- No auth required (public DNS queries)

### Edge Function: `process-sequences`
- Hourly cron function
- Queries `contact_sequence_state` where `next_send_at <= now()` and status = 'active'
- Checks if contact has replied (replied_at IS NOT NULL) — if so, marks completed
- Otherwise sends next step email with tracking pixel, updates current_step and next_send_at
- Uses service role key (called by cron)

### Frontend: DNS Health Panel (Accounts page)
- After account is added or on "Recheck" click, call `check-dns` with domain extracted from email
- Display 3 rows: SPF/DKIM/DMARC with green check or red X
- Collapsible "How to fix" sections with DNS record examples
- "Domain Health Score" badge: 3/3 green, 2/3 yellow, 0-1/3 red
- Store results in component state (no separate table needed — DNS checks are fast and free)

### Frontend: Deliverability Score (Accounts + Dashboard)
- Computed client-side: SPF(+25) + DKIM(+25) + DMARC(+25) + reputation>70(+25) = 100 max
- Circular SVG progress ring on each account card
- Color: red 0-40, orange 41-70, green 71-100
- Dashboard shows "weakest account" warning if any <60

---

## Pass 2: Slow Ramp + Behavioral Warmup + Sequences UI

### Warmup page updates
- Show ramp info per account: "Day X — sending Y/day — max Z/day"
- Mini ramp curve visualization (small sparkline showing volume over days)
- Behavioral stats: marked important count, rescued from spam count

### Updated `warmup-run` edge function
- Calculate daily target: `min(ramp_day * 2, warmup_daily_limit)` with ±20% random variance
- Add random jitter (0-45 min setTimeout) between sends
- After send, with `mark_important_rate`% probability, insert a `marked_important` warmup_log
- With `spam_rescue_rate`% probability, insert a `rescued_from_spam` log
- Skip weekends if `warmup_weekdays_only` is true
- Vary reply body length randomly from pool

### Updated midnight cron reset
- Also increment `warmup_ramp_day` by 1 for warmup_enabled accounts

### Campaigns: Sequence Builder UI
- Toggle: "Single email" vs "Sequence" in campaign creation
- When Sequence: vertical timeline step builder (up to 5 steps)
- Each step: subject, body (with tokens), delay_days
- On create: insert into `sequence_steps` table
- On send: create `contact_sequence_state` rows for each contact with step 1

### Campaigns: Contact drilldown sequence indicator
- Show "Step X of Y" badge per contact in the Sheet panel

---

## Pass 3: Analytics Page + Unibox

### New page: Analytics (`/analytics`)
- Overview stat cards: total sent, total opens, total replies, avg open rate, avg reputation
- 14-day warmup activity line chart (warmup_logs grouped by date)
- Campaign comparison grouped bar chart (sent/opens/replies per campaign)
- Top performing campaigns table sorted by open rate
- Reputation over time multi-line chart (one line per account)

### New page: Unibox (`/unibox`)
- Replaces/supplements Inbox — shows messages from ALL accounts
- Left panel: chronological message list with account badge, sender, subject preview
- Filter bar: account dropdown, tabs (All / Unread / Warmup / Campaign Replies)
- Right panel: full message body + Reply/Mark Read/Archive actions
- Reply: compose area, sends via account's SMTP through `send-campaign` logic
- Unread badge on sidebar nav item
- Auto-detect warmup emails by checking subject against warmup patterns

### Sidebar updates
- Add Analytics (BarChart3 icon) between Campaigns and Inbox
- Add Unibox (InboxIcon with badge) replacing or alongside Inbox
- Move Settings to bottom (above Sign Out)

### Router updates
- Add `/analytics` and `/unibox` routes

---

## Files to Create/Modify

| File | Action |
|------|--------|
| 1 migration SQL | Create (new tables, columns, enums, RLS) |
| `supabase/functions/check-dns/index.ts` | Create |
| `supabase/functions/process-sequences/index.ts` | Create |
| `supabase/functions/warmup-run/index.ts` | Edit (ramp + behavioral) |
| `supabase/config.toml` | Edit (add new functions) |
| `src/pages/Accounts.tsx` | Edit (DNS health panel, deliverability ring) |
| `src/pages/Dashboard.tsx` | Edit (deliverability warning) |
| `src/pages/Warmup.tsx` | Edit (ramp info, behavioral stats) |
| `src/pages/Campaigns.tsx` | Edit (sequence builder, step indicator) |
| `src/pages/Analytics.tsx` | Create |
| `src/pages/Unibox.tsx` | Create |
| `src/components/AppSidebar.tsx` | Edit (new nav items) |
| `src/components/DeliverabilityRing.tsx` | Create |
| `src/components/DnsHealthPanel.tsx` | Create |
| `src/App.tsx` | Edit (new routes) |

Due to the massive scope, I recommend implementing Pass 1 first, verifying it works, then proceeding to Pass 2 and 3. Shall I begin with Pass 1?


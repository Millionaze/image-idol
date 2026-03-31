

# Pixel Growth — Full Feature Upgrade Plan

This is a large overhaul spanning 7 features. Each involves database tables, edge function updates, and UI rewrites. All AI calls go through edge functions using the existing `ANTHROPIC_API_KEY` and `claude-sonnet-4-20250514`.

---

## Database Migration

**8 new tables:**

| Table | Purpose |
|-------|---------|
| `campaign_sequences` | Condition-based sequence steps (replaces simple `sequence_steps`) |
| `list_cleaning_jobs` | Async list cleaning job tracking |
| `list_cleaning_results` | Per-email validation results |
| `copy_history` | AI copywriter output history |
| `subject_tests` | Subject line test history |
| `send_plans` | AI send time recommendations |
| `audit_reports` | Full audit results with scores per layer |
| `spintax_templates` | Saved spintax templates |

**Modify existing tables:**
- `campaigns`: add `paused_reason text`, `spam_complaint_count int DEFAULT 0`, `unsubscribe_count int DEFAULT 0`
- `contact_sequence_state`: add `last_action text`, `last_action_at timestamptz`, `scheduled_send_at timestamptz`

All tables get RLS policies scoped to `auth.uid() = user_id`.

---

## Feature 1: Campaigns — Smart Sequencing

**DB**: `campaign_sequences` table with `condition_type` enum: `no_open`, `open_no_reply`, `link_click`, `always`.

**Edge Function**: New `generate-sequence` type in `generate-email-copy` — accepts a campaign goal and generates a 5-step AI sequence with subjects, bodies, delays, and conditions as JSON.

**Edge Function**: Update `send-campaign` to:
- Stagger sends randomly across a 4-hour window (random delay 0–4hrs per contact)
- Check bounce/spam/unsub rates and auto-pause if thresholds exceeded
- Log pause reason to `campaigns.paused_reason`

**UI** (`Campaigns.tsx`):
- Add "AI Generate Sequence" button — user enters goal, AI returns 5 steps with conditions
- Each step shows a condition dropdown (no_open / open_no_reply / link_click / always)
- Increase max steps from 5 to 7
- Show auto-pause alerts on campaign cards when `paused_reason` is set
- Per-contact state panel shows current step + reason for progression

---

## Feature 2: List Cleaner — Real Validation

**Edge Function**: New `validate-email-list/index.ts` (~300 lines):
- Accepts list of emails, runs 6 validation layers:
  1. Syntax (regex)
  2. Domain MX lookup (DNS query via Google DNS API)
  3. Disposable domain check (hardcoded list of ~200 domains)
  4. Role-based prefix check
  5. Catch-all detection (SMTP RCPT TO with random address)
  6. SMTP verification (EHLO → MAIL FROM → RCPT TO handshake, no actual send)
- Returns per-email status: valid / risky / invalid / disposable
- Processes in batches; updates `list_cleaning_jobs` status as it goes

**Storage**: Create `email-lists` bucket for CSV uploads.

**UI** (`ListCleaner.tsx`): Complete rewrite:
- CSV file upload (drag-and-drop) → stores in Supabase storage
- Triggers edge function, polls `list_cleaning_jobs` every 3s for progress
- Summary dashboard: total, valid%, risky%, invalid%, disposable%, estimated deliverability score
- Results table with status badges (✅⚠️❌🗑️)
- Download options: valid only, valid+risky, full report with tags
- Job history list from `list_cleaning_jobs`

---

## Feature 3: CopyWriter — AI Campaign Copy Engine

**Edge Function**: Enhance `generate-email-copy` `copy` type:
- Accept new fields: `pain_point`, `customer_profile` (job title, industry, company size)
- System prompt generates 3 variations with specific angles: Pain-led (A), Outcome-led (B), Curiosity-led (C)
- Each variation returns: `subject`, `body`, `angle`, `spam_warnings[]` (flagged words), `tone_score` (1-10 formal→casual)
- New type `regenerate-variation`: regenerate just one angle

**DB**: `copy_history` stores all generated copy with context.

**UI** (`CopyWriter.tsx`): Major upgrade:
- Step 1: Context form with pain point, customer profile fields, tone, length
- Step 2: Three variation cards labeled "Pain-led", "Outcome-led", "Curiosity-led"
- Each card shows: subject, body, read time, spam trigger warnings (highlighted words), tone score bar
- Buttons: Copy, Regenerate This, Use in Campaign, A/B Test
- "A/B Test" pushes two variations into a new campaign with 50/50 split
- History panel showing past generations from `copy_history`

---

## Feature 4: Subject Tester — Predictive Intelligence

**Edge Function**: New `analyze-subject` type in `generate-email-copy`:
- AI analyzes subject line and returns JSON with: `spam_score` (0-100), `predicted_open_rate` (range string), `open_rate_reasoning`, `preview_text_suggestion`, `improved_versions[]` (3 rewrites with explanations)
- For multi-subject input: ranks them and recommends A/B pair

**DB**: `subject_tests` stores test history.

**UI** (`SubjectTester.tsx`): Major upgrade:
- Multi-subject input (up to 5, one per line)
- Per subject: spam score ring, predicted open rate, flagged words with explanations
- Preview text suggestion section
- Mobile preview (40-char truncation mockup)
- AI improvement engine: 3 improved versions with change explanations
- Multi-subject comparison: ranking table with A/B recommendation
- History panel from `subject_tests`

---

## Feature 5: Send Planner — AI Timing Intelligence

**Edge Function**: New `analyze-send-time` type in `generate-email-copy`:
- Accepts: timezone, industry, email type, historical campaign data (open rates by hour/day)
- AI returns: best day + reasoning, best time window, days to avoid, recommended cadence
- Returns heatmap data: 7×24 grid with scores (0-10) per cell

**DB**: `send_plans` stores recommendations.

**UI** (`SendPlanner.tsx`): Major upgrade:
- Input form: target timezone, industry dropdown, email type, day range
- AI analysis output cards: best day, best time, avoid times, cadence
- CSS grid heatmap: 7 days × 24 hours, color-coded (green/yellow/red)
- Click a heatmap cell → schedule campaign at that time
- "Your Best Times" section: if past campaigns exist, show personal open-rate-by-hour analysis
- History from `send_plans`

---

## Feature 6: Audit Report — Full Diagnosis

**Edge Function**: New `run-full-audit/index.ts` (~400 lines):
- Runs 5 layers per account:
  1. DNS: SPF (check lookup count ≤10), DKIM (key length), DMARC (policy level), MX records, tracking domain CNAME
  2. Blacklist: check against 25 lists (uses existing `check-blacklist` logic), provide delisting URLs
  3. Infrastructure: separate sending domain check, tracking domain, provider reputation
  4. Content risk: analyze last 3 campaigns for spam words, link density, image-to-text ratio, plain vs HTML
  5. Engagement: aggregate open/reply/bounce/unsub/spam rates, compare to benchmarks
- Computes per-layer scores and total 0-100 score with letter grade
- Returns prioritized fix list ordered by impact

**DB**: `audit_reports` stores results per domain.

**UI** (`AuditReport.tsx`): Major upgrade:
- Domain selector (from connected accounts) or manual input
- Progress indicator during audit
- Score card with letter grade and circular ring
- 5 collapsible sections, one per layer, with individual scores
- Each failed check: problem, exact fix steps, estimated impact
- "Fix These First" priority list (top 3 by impact)
- Download as HTML report (improved from current)
- Audit history from `audit_reports`

---

## Feature 7: Spintax — AI Variation Generator

**Edge Function**: Enhance `generate-email-copy` with new types:
- `spintax-auto`: AI identifies 5-8 variable phrases, generates 3-5 alternatives each, returns full spintax email + variation count
- `spintax-suggest`: given a selected phrase, AI returns 4 alternative phrasings
- `spintax-check`: AI reviews all variations for unnatural/grammatically wrong phrases, flags issues

**DB**: `spintax_templates` for saving/loading templates.

**UI** (`Spintax.tsx`): Major upgrade:
- Mode tabs: Auto-Spintax / Manual Builder / Previewer
- **Auto mode**: Paste plain email → "AI Spintax" → returns full spintax with highlighted variations + combination count
- **Manual mode**: Select text → "Add Variations" → AI suggests 4 alternatives → user picks → wraps in {|} syntax. Real-time preview.
- **Previewer mode**: Paste spintax → preview random renders → spam check across all combinations → quality checker flags unnatural variations
- Save/load templates from `spintax_templates`
- Variation count display with "unique emails" label

---

## Implementation Order

1. Database migration (8 new tables + column additions + storage bucket)
2. Edge functions: `validate-email-list`, `run-full-audit`, enhanced `generate-email-copy` (new types)
3. UI: List Cleaner (most self-contained)
4. UI: CopyWriter
5. UI: Subject Tester
6. UI: Spintax
7. UI: Send Planner
8. UI: Audit Report
9. UI: Campaigns (smart sequencing)
10. Update `send-campaign` (stagger + auto-pause)

---

## Technical Notes

- All AI calls route through `generate-email-copy` edge function (expanded with new `type` values) or dedicated new edge functions for heavy operations
- Long-running jobs (list cleaning, audit) use polling: frontend calls edge function to start, then polls the job table every 3s
- Every AI output gets Copy + Regenerate buttons
- Empty states use "Connect an account" or "Try your first X" CTAs
- Error messages surface the exact AI error (rate limit, payment, etc.)
- All new tables have RLS: `auth.uid() = user_id` or joined via owned parent table


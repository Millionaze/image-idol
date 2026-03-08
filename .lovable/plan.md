

# Tools Section — 6 New Pages

## Overview

Add 6 tool pages under a "Tools" separator in the sidebar. Each page is a self-contained utility. Two tools (Copy Writer, Subject Tester suggestions, Spintax suggestions) need AI via edge functions; the rest are frontend-only.

## Architecture

### Sidebar Changes (`AppSidebar.tsx`)
Add a second `SidebarGroup` with a "Tools" label and 6 items:
- List Cleaner (`/tools/list-cleaner`, Filter icon)
- Copy Writer (`/tools/copy-writer`, PenLine icon)
- Subject Tester (`/tools/subject-tester`, Zap icon — but Zap is taken by Warmup, use FlaskConical or Target instead)
- Send Planner (`/tools/send-planner`, Calendar icon)
- Audit Report (`/tools/audit-report`, ClipboardCheck icon)
- Spintax (`/tools/spintax`, Shuffle icon)

### Routing (`App.tsx`)
Add 6 routes inside the protected AppLayout group.

### Edge Functions

**`generate-email-copy`** — New function for Copy Writer + Subject Tester rewrite + Spintax suggestions. Single function with a `type` parameter (`copy`, `subject-rewrite`, `spintax`). Uses Lovable AI Gateway with `google/gemini-3-flash-preview`. Returns JSON arrays parsed from AI response.

### Pages

**Tool 1: List Cleaner** (`src/pages/tools/ListCleaner.tsx`)
- Textarea for pasting emails (one per line or CSV)
- Frontend-only validation: regex format, role-based detection (info@, admin@, etc.), suspicious TLDs (.xyz, .top, etc.), duplicate removal, free provider flagging
- Results table with status column and remove action
- Summary bar with counts
- Download CSV button, Import to Campaign button (navigates to `/campaigns` with state)

**Tool 2: Copy Writer** (`src/pages/tools/CopyWriter.tsx`)
- Form: product, audience, goal dropdown, tone dropdown, length dropdown
- Generate button calls `generate-email-copy` edge function with type=`copy`
- Displays 3 variation cards with subject, body, char count, copy button
- "Generate Follow-up" per variation calls same function with follow-up context
- "Save to Campaign" navigates to campaigns with pre-filled data

**Tool 3: Subject Tester** (`src/pages/tools/SubjectTester.tsx`)
- Text input with real-time scoring (300ms debounce)
- Frontend checks: length 6-50, spam words (80+ hardcoded list), all-caps, excessive punctuation, emoji warning, personalization tokens, question format, number present
- Score = (passed/total) × 100, displayed as SVG circle gauge (reuse DeliverabilityRing pattern)
- Grade A/B/C/D
- "Get AI Suggestions" button calls edge function with type=`subject-rewrite`

**Tool 4: Send Planner** (`src/pages/tools/SendPlanner.tsx`)
- Inputs: total contacts, multi-select accounts (from Supabase), daily limits (auto-filled), start date picker, sending days checkboxes
- Frontend calculation: daily capacity, days needed, day-by-day breakdown
- Calendar grid (4 weeks) with hover tooltips showing per-account breakdown
- Summary text with completion date

**Tool 5: Audit Report** (`src/pages/tools/AuditReport.tsx`)
- "Run Full Audit" button
- For each account: calls `check-dns` and `check-blacklist` edge functions, reads reputation/warmup/campaign stats from DB
- Displays structured report with pass/fail per check
- Weighted scoring: SPF 20, DKIM 20, DMARC 20, Blacklist 20, Reputation 10, Open rate 10
- Executive summary at top
- "Download Report" opens printable HTML in new tab
- "Fix Issues" links to relevant pages

**Tool 6: Spintax** (`src/pages/tools/Spintax.tsx`)
- Textarea editor for writing email with `{option1|option2}` syntax
- Highlight spintax groups with colored spans (render preview with highlighting)
- "Preview Variations" generates 5 random renderings
- "Add Variation" on text selection wraps in spintax syntax
- "AI Suggest" button calls edge function with type=`spintax`
- Unique combinations calculator (product of options per group)
- Export/copy button

## Files

| File | Action |
|------|--------|
| `supabase/functions/generate-email-copy/index.ts` | Create |
| `supabase/config.toml` | Edit (add function) |
| `src/pages/tools/ListCleaner.tsx` | Create |
| `src/pages/tools/CopyWriter.tsx` | Create |
| `src/pages/tools/SubjectTester.tsx` | Create |
| `src/pages/tools/SendPlanner.tsx` | Create |
| `src/pages/tools/AuditReport.tsx` | Create |
| `src/pages/tools/Spintax.tsx` | Create |
| `src/components/AppSidebar.tsx` | Edit (add Tools section) |
| `src/App.tsx` | Edit (add 6 routes) |

## Implementation Order

1. Edge function + config
2. Sidebar + routing
3. All 6 pages (parallel creation)


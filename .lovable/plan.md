

# MailForge — Full-Stack Implementation Plan

## Overview

Build MailForge as a fully functional email warmup and cold email marketing platform using Supabase (Postgres + Auth + Edge Functions) as the backend, replacing the originally specified Node.js/Express/SQLite stack.

## Architecture

```text
┌─────────────────────────────────────┐
│  React Frontend (Vite + Tailwind)   │
│  7 Pages + Dark Theme + Sidebar     │
├─────────────────────────────────────┤
│  Supabase Client SDK                │
│  Auth · DB Queries · Function Calls │
├─────────────────────────────────────┤
│  Supabase Backend                   │
│  ┌───────────┐ ┌──────────────────┐ │
│  │ Postgres  │ │ Edge Functions   │ │
│  │ 6 tables  │ │ smtp-test        │ │
│  │ RLS       │ │ send-campaign    │ │
│  │ pg_cron   │ │ warmup-run       │ │
│  └───────────┘ │ inbox-sync       │ │
│                │ track-open (pub) │ │
│                └──────────────────┘ │
└─────────────────────────────────────┘
```

## Important Limitation

Supabase Edge Functions run Deno — `nodemailer` and `node-imap` won't work natively. For SMTP sending, we'll use Deno's built-in `fetch` with raw SMTP or the `npm:nodemailer` compatibility layer. For IMAP, we'll implement a simplified fetch via the IMAP protocol or store credentials and provide a "test connection" endpoint. If IMAP proves infeasible in Deno, the inbox will use mock data with the UI fully built and ready for a future IMAP integration.

## Phase 1: Database Schema

Create 6 tables via migration:

- **profiles** — id (uuid, FK auth.users), email, name, created_at
- **email_accounts** — id, user_id (FK profiles), name, email, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, username, password (encrypted), warmup_enabled, warmup_daily_limit, warmup_sent_today, warmup_total_sent, warmup_total_received, reputation_score, status, created_at
- **campaigns** — id, user_id, account_id (FK email_accounts), name, subject, body, status (draft/sending/active/paused), daily_limit, sent_count, open_count, reply_count, bounce_count, created_at
- **contacts** — id, campaign_id (FK campaigns), email, name, status (pending/sent/opened/bounced), sent_at, opened_at, replied_at
- **warmup_logs** — id, account_id (FK email_accounts), type (sent/received), partner_email, subject, status, created_at
- **inbox_messages** — id, account_id (FK email_accounts), from_email, from_name, subject, body, is_warmup, is_read, received_at

RLS policies: All tables scoped to authenticated user via `auth.uid()`. Profiles auto-created via trigger on signup.

## Phase 2: Authentication

- Supabase Auth (email + password)
- Login and Register pages
- AuthProvider context with `onAuthStateChange`
- ProtectedRoute wrapper redirecting to `/login`
- Profile auto-creation trigger

## Phase 3: Edge Functions

1. **smtp-test** — Accepts SMTP credentials, attempts connection via `npm:nodemailer`, returns success/error
2. **send-campaign** — Iterates pending contacts, sends emails with personalization ({{name}}, {{email}}), embeds tracking pixel, updates contact status, 1.5s delay between sends
3. **warmup-run** — Picks 2+ enabled accounts, sends natural emails between them using hardcoded subject/body pool, updates warmup counters and reputation
4. **track-open** — Public endpoint (no JWT), serves 1x1 transparent GIF, updates contact opened_at and campaign open_count. Config: `verify_jwt = false`
5. **inbox-sync** — Attempts IMAP fetch of recent messages; if IMAP isn't feasible in Deno, returns mock data

## Phase 4: Cron Jobs

Using pg_cron + pg_net:
- Every 2 hours Mon–Fri 9am–5pm: call warmup-run edge function
- Daily at midnight: reset warmup_sent_today to 0 for all accounts

## Phase 5: Frontend UI

### Theme & Layout
- Dark background `#0a0a0f`, accent `#ff6b35`, green `#22d3a0`
- Space Grotesk font for headings
- Sidebar: flame icon + "Mail**Forge**", 5 nav items (Dashboard, Warmup, Accounts, Campaigns, Inbox)

### Pages (7 total)
1. **Login** / **Register** — Auth forms with Supabase Auth
2. **Dashboard** — Stat cards, Recharts area chart (7-day activity), recent warmup feed, campaign performance table
3. **Warmup** — Account list with toggle switches, reputation bars (green/yellow/red), daily limit inputs, "Run Warmup Now" button, 2+ account warning
4. **Accounts** — Add/edit modal with SMTP/IMAP fields, Gmail/Outlook/Yahoo preset buttons, test connection button, account cards
5. **Campaigns** — Campaign table with status badges, clickable rows → side panel with per-contact tracking, create form with paste-contacts input, {{name}}/{{email}} tokens
6. **Inbox** — Account dropdown, sync button, two-panel layout (message list + body viewer)

### Key Components
- `AppSidebar` — Navigation sidebar
- `AppLayout` — Sidebar + main content wrapper
- `ProtectedRoute` — Auth guard
- `ReputationBar` — Color-coded progress bar
- `StatusBadge` — Campaign status badges
- `ContactPanel` — Slide-out panel for per-contact tracking

## Implementation Order

1. Database migration (all 6 tables + RLS + trigger)
2. Auth pages (Login, Register) + AuthProvider + ProtectedRoute
3. App layout (sidebar, theme, routing)
4. Dashboard page with stat cards + charts
5. Accounts page + smtp-test edge function
6. Warmup page + warmup-run edge function
7. Campaigns page + send-campaign edge function + track-open edge function
8. Inbox page + inbox-sync edge function
9. Cron jobs via pg_cron

This is a large build — it will be implemented incrementally across multiple messages. I'll start with the database schema, auth, and core layout.


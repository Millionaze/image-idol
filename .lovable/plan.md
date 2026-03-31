

# Warmup Engine Overhaul

A complete rewrite of the backend warmup logic across 8 systems. This involves 5 new database tables, 4 new edge functions, and a major rewrite of the existing `warmup-run` and `generate-warmup-content` functions.

---

## Database Migration

**5 new tables + 1 enum type:**

```sql
-- warmup_threads: conversation threading state
warmup_threads (
  id uuid PK, account_a uuid FK→email_accounts, account_b uuid FK→email_accounts,
  thread_id text UNIQUE, message_count int DEFAULT 0, last_message_at timestamptz,
  status text DEFAULT 'open', created_at timestamptz DEFAULT now()
)

-- warmup_content_log: content dedup hashes
warmup_content_log (
  id uuid PK, account_id uuid FK→email_accounts, subject_hash text,
  body_hash text, sent_at timestamptz DEFAULT now()
)

-- warmup_rescues: spam rescue tracking
warmup_rescues (
  id uuid PK, sending_account_id uuid, receiving_account_id uuid,
  message_id text, landed_in_spam_at timestamptz, rescued_at timestamptz,
  rescue_success boolean DEFAULT false
)

-- warmup_partnerships: network diversity tracking
warmup_partnerships (
  id uuid PK, account_id uuid FK→email_accounts, partner_account_id uuid FK→email_accounts,
  provider_type text, assigned_at timestamptz DEFAULT now(),
  expires_at timestamptz, daily_interaction_count int DEFAULT 0
)

-- warmup_scores: readiness score history
warmup_scores (
  id uuid PK, account_id uuid FK→email_accounts, score int,
  gmail_score int, outlook_score int, reply_score int, rescue_score int,
  dns_score int, age_score int, calculated_at timestamptz DEFAULT now()
)

-- dns_health_log: DNS monitoring history
dns_health_log (
  id uuid PK, domain text, spf_status boolean, dkim_status boolean,
  dmarc_status boolean, checked_at timestamptz DEFAULT now(),
  changed_from jsonb, changed_to jsonb
)
```

All tables get RLS policies scoped to authenticated users via `email_accounts.user_id = auth.uid()`.

Add columns to `email_accounts`:
- `warmup_status text DEFAULT 'active'` — values: active, graduated, dns_error, maintenance
- `last_reply_length text DEFAULT 'medium'` — tracks last reply length to avoid repeats

---

## Edge Functions

### 1. Rewrite `warmup-run/index.ts` (~400 lines)

The core orchestrator. Major changes:

- **Partner selection**: Query `warmup_partnerships` for valid partners. If expired or missing, run the Network Diversity Manager to assign new partners with provider distribution (40-50% Gmail, 30-35% Outlook, 15-25% custom). Cap 3 interactions/day per pair. Rotate every 7 days.
- **Thread-aware sending**: Before creating a new email, check `warmup_threads` for pending replies. If Account B owes a reply to A (scheduled_reply_at has passed), send the reply instead of a new thread. Thread logic: message 1 always sent, message 2 reply (8min–5hr delay), message 3 at 30% probability, message 4 at 40% probability. Max 4 messages. Never reuse same A↔B pair within 7 days.
- **Behavioral randomization**: Replace fixed timing with the action probability engine:
  - Mark read + reply: 55%
  - Mark read only: 20%
  - Mark important + reply: 15%
  - Star + reply: 7%
  - Do nothing: 3%
- **Ramp curve**: `daily_limit = min(2 * 1.3^day, max_volume)` instead of `day * 2`
- **Time window**: Only send between 7am–8pm (account timezone — stored in localStorage prefs, passed as param or default UTC)
- **Content generation**: Call enhanced `generate-warmup-content` with thread context, persona, and dedup checks. Log subject_hash + body_hash to `warmup_content_log`. Reject if duplicate hash exists.
- **Maintenance mode**: If `warmup_status = 'graduated'`, send 5–8 emails/day. If campaign spam rate > 4%, bump to 15/day for 3 days. If > 8%, pause campaigns and set 25/day for 5 days.

### 2. Rewrite `generate-warmup-content/index.ts` (~120 lines)

Enhanced AI content generation:

- Accept new params: `{ persona, thread_context, previous_message_summary, is_reply, account_id }`
- System prompt includes persona context and thread history
- For replies: include previous message summary, instruct AI to reference it naturally
- Enforce plain text only, no links/CTAs/promotional language
- Vary length: 3 sentences to 2 paragraphs, never same length twice in a row (track via `email_accounts.last_reply_length`)
- Before returning, hash subject + body and check `warmup_content_log` for duplicates. If duplicate, regenerate (up to 3 retries).

### 3. New `warmup-rescue/index.ts` (~200 lines)

Inbox rescue engine — called by cron every 5 minutes:

- For each warmup-enabled account, connect via IMAP
- SELECT the Junk/Spam folder (try "Junk", "[Gmail]/Spam", "Spam")
- Search for warmup emails (match by partner_email from warmup_logs)
- For each found: IMAP COPY to INBOX, STORE +FLAGS (\\Seen \\Flagged), STORE -FLAGS (\\Deleted in spam folder)
- Log to `warmup_rescues` with timestamps
- Track rescue rate per sending account; if < 80%, update account status alert

### 4. New `warmup-dns-monitor/index.ts` (~100 lines)

DNS monitoring — called by cron every 2 hours:

- Get distinct domains from active warmup accounts
- For each domain, call the existing `check-dns` function logic (SPF, DKIM, DMARC)
- Compare against last entry in `dns_health_log`
- If any record changed/disappeared: pause warmup for all accounts on that domain, set `warmup_status = 'dns_error'`
- If records restored: resume warmup, set `warmup_status = 'active'`
- Log all checks to `dns_health_log`

### 5. New `warmup-score/index.ts` (~100 lines)

Readiness scoring — called by cron every 6 hours:

- For each warmup-enabled account, compute score using the 100-point formula:
  - Gmail inbox rate (25pts): from warmup_logs last 7 days, filtered by partner smtp_host containing gmail
  - Outlook inbox rate (25pts): same for outlook
  - Reply rate (20pts): threads with replies / total threads last 7 days
  - Rescue rate (15pts): from warmup_rescues
  - DNS health (10pts): from dns_health_log
  - Age (5pts): days since warmup_start_date
- Store in `warmup_scores`
- If score hits 85+, set `warmup_status = 'graduated'`
- Campaign gate: score < 70 = soft block (existing UI gate), score < 50 = hard block (add check in `send-campaign`)

---

## Cron Jobs (pg_cron + pg_net)

4 scheduled jobs to set up via SQL insert:

| Job | Schedule | Function |
|-----|----------|----------|
| Warmup run | Every 15 min | `warmup-run` |
| Spam rescue | Every 5 min | `warmup-rescue` |
| DNS monitor | Every 2 hours | `warmup-dns-monitor` |
| Score calc | Every 6 hours | `warmup-score` |

---

## Config Updates

Add to `supabase/config.toml`:
```toml
[functions.warmup-rescue]
verify_jwt = false

[functions.warmup-dns-monitor]
verify_jwt = false

[functions.warmup-score]
verify_jwt = false
```

---

## Campaign Gate Update (`send-campaign/index.ts`)

Before sending, query `warmup_scores` for the account's latest score:
- Score < 50: return error, hard block, no override
- Score 50–69: return warning with `allow_override: true`

---

## Implementation Order

1. Database migration (5 tables + email_accounts columns)
2. `generate-warmup-content` rewrite (AI enhancement)
3. `warmup-run` rewrite (threading, behavioral randomization, partner selection, maintenance mode)
4. `warmup-rescue` new function
5. `warmup-dns-monitor` new function
6. `warmup-score` new function
7. `send-campaign` gate update
8. Cron job setup

No UI changes — all backend logic.


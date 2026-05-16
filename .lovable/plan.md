## Plan: Fix DB resource exhaustion

The `pg_sleep` (1.3 billion ms) and 107k `net.http_post` calls trace to **4 cron jobs running every 30s** (two of which do `pg_sleep(30)` to fake sub-minute scheduling) plus aggressive frontend polling.

### Diagnosis

**pg_cron (`select * from cron.job`):**

| jobid | name | schedule | command |
|-------|------|----------|---------|
| 7 | workflow-event-processor-30s-a | `* * * * *` | http_post |
| 8 | workflow-event-processor-30s-b | `* * * * *` | `pg_sleep(30)` + http_post |
| 9 | workflow-runner-30s-a | `* * * * *` | http_post |
| 10 | workflow-runner-30s-b | `* * * * *` | `pg_sleep(30)` + http_post |
| 4 | warmup-rescue | `*/5 * * * *` | http_post |
| 3 | warmup-cycle | `*/15 * * * *` | http_post |

That's **4 hits/min** to edge functions plus **2 long-held connections/min holding pg_sleep(30)** — the dominant cost.

**Frontend polling:**
- `src/pages/Unibox.tsx:146` — `syncAll` every 2 min
- `src/components/AppSidebar.tsx:63` — unread count every 30 s

### Fix (data-only, no schema migration)

**1. Cron — drop "b" jobs and slow "a" jobs to every 2 min** (insert tool, since these are data ops on `cron.job`):

```sql
select cron.unschedule('workflow-event-processor-30s-b');
select cron.unschedule('workflow-runner-30s-b');
select cron.alter_job((select jobid from cron.job where jobname='workflow-event-processor-30s-a'),
                     schedule := '*/2 * * * *');
select cron.alter_job((select jobid from cron.job where jobname='workflow-runner-30s-a'),
                     schedule := '*/2 * * * *');
```

Result: pg_sleep(30) eliminated, http_posts drop from ~115k/day → ~1.5k/day for these two crons.

**2. Add a daily purge job** for `cron.job_run_details` and `net._http_response` (currently grow forever, ~500k writes in the sample):

```sql
select cron.schedule('purge-cron-net-history', '15 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from net._http_response where created < now() - interval '1 day';
$$);
```

**3. Frontend polling tweaks:**
- `src/pages/Unibox.tsx`: bump `2 * 60 * 1000` → `10 * 60 * 1000` (10 min)
- `src/components/AppSidebar.tsx`: bump `30000` → `120000` (2 min)

**4. Indexes** (schema migration — separate `supabase--migration` call) on the hot polling queries:

```sql
create index if not exists idx_inbox_messages_unread_real
  on inbox_messages (account_id, received_at desc)
  where is_read = false and is_warmup = false;

create index if not exists idx_events_pending
  on events (occurred_at)
  where processing_status = 'pending';

create index if not exists idx_email_accounts_warmup_active
  on email_accounts (id)
  where warmup_enabled = true and imap_host is not null;
```

### Expected impact
- ~95% reduction in `net.http_post` calls
- pg_sleep load → ~0
- Unibox query (#3 in your top list) drops from 29k → ~6k calls/window
- Memory pressure from `cron.job_run_details` bloat removed

### Out of scope
- Compute upgrade (revisit only if still tight after this)
- Refactoring workflow-runner into a queue worker (bigger architectural change)

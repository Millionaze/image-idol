
-- 1. Remove duplicate 30s "b" cron jobs that use pg_sleep(30)
select cron.unschedule('workflow-event-processor-30s-b');
select cron.unschedule('workflow-runner-30s-b');

-- 2. Slow remaining workflow crons from every minute to every 2 minutes
select cron.alter_job(
  (select jobid from cron.job where jobname='workflow-event-processor-30s-a'),
  schedule := '*/2 * * * *'
);
select cron.alter_job(
  (select jobid from cron.job where jobname='workflow-runner-30s-a'),
  schedule := '*/2 * * * *'
);

-- 3. Daily purge of cron + pg_net history (unschedule first so re-runs are idempotent)
do $$ begin
  perform cron.unschedule('purge-cron-net-history');
exception when others then null; end $$;

select cron.schedule('purge-cron-net-history', '15 3 * * *', $$
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  delete from net._http_response where created < now() - interval '1 day';
$$);

-- 4. Indexes for hot polling queries
create index if not exists idx_inbox_messages_unread_real
  on public.inbox_messages (account_id, received_at desc)
  where is_read = false and is_warmup = false;

create index if not exists idx_events_pending
  on public.events (occurred_at)
  where processing_status = 'pending';

create index if not exists idx_email_accounts_warmup_active
  on public.email_accounts (id)
  where warmup_enabled = true and imap_host is not null;

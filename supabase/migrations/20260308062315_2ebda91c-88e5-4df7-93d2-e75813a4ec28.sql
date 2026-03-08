
-- Warmup cron: every 2 hours Mon-Fri 9am-5pm UTC
SELECT cron.schedule(
  'warmup-cycle',
  '0 9,11,13,15,17 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/warmup-run',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body := '{"time": "scheduled"}'::jsonb
  ) AS request_id;
  $$
);

-- Daily reset: midnight UTC
SELECT cron.schedule(
  'warmup-daily-reset',
  '0 0 * * *',
  $$
  UPDATE public.email_accounts SET warmup_sent_today = 0 WHERE warmup_enabled = true;
  $$
);

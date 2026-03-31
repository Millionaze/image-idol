
-- Update existing warmup-cycle to run every 15 minutes
SELECT cron.unschedule('warmup-cycle');

SELECT cron.schedule(
  'warmup-cycle',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/warmup-run',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'warmup-rescue',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/warmup-rescue',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'warmup-dns-monitor',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url:='https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/warmup-dns-monitor',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'warmup-score',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url:='https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/warmup-score',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body:='{"time": "now"}'::jsonb
  ) as request_id;
  $$
);


-- Schedule the workflow engine cron jobs (every 30 seconds via overlapping minute slots)
SELECT cron.schedule(
  'workflow-event-processor-30s-a',
  '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/workflow-event-processor',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'workflow-event-processor-30s-b',
  '* * * * *',
  $$ SELECT pg_sleep(30); SELECT net.http_post(
    url := 'https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/workflow-event-processor',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'workflow-runner-30s-a',
  '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/workflow-runner',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

SELECT cron.schedule(
  'workflow-runner-30s-b',
  '* * * * *',
  $$ SELECT pg_sleep(30); SELECT net.http_post(
    url := 'https://ivyqkprlrosapkmmwkeh.supabase.co/functions/v1/workflow-runner',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2eXFrcHJscm9zYXBrbW13a2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NDE0NTksImV4cCI6MjA4ODUxNzQ1OX0.sUDOxXBvGBjh_ZoG_K4m7zO-uE-phNtHq2AylrJZVxY"}'::jsonb,
    body := '{}'::jsonb
  ); $$
);

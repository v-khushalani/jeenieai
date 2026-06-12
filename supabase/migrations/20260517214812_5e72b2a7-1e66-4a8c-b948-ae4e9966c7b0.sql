CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'classify-misc-loop';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'classify-misc-loop',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ngduavjaiqyiqjzelfpl.supabase.co/functions/v1/classify-misc-by-text',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZHVhdmphaXF5aXFqemVsZnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTIwNzMsImV4cCI6MjA4NzE4ODA3M30.zuNey1ADktf5reHYO8Op8z_P9fN40tvBPqRMM5lD4fE","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZHVhdmphaXF5aXFqemVsZnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTIwNzMsImV4cCI6MjA4NzE4ODA3M30.zuNey1ADktf5reHYO8Op8z_P9fN40tvBPqRMM5lD4fE"}'::jsonb,
    body := '{"action":"start","minScore":0.18,"margin":0.03}'::jsonb
  );
  $$
);
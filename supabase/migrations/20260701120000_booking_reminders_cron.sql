-- Hourly cron: invoke booking-reminders Edge Function (push 24h / 1h / company escalation).
-- Requires pg_cron + pg_net (enable in Dashboard → Database → Extensions if missing).
-- Function verify_jwt = false; uses publishable key (public, same as the mobile app).

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'booking-reminders-hourly' LIMIT 1;
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'booking-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://brrjuxgxmpgvkddcuaad.supabase.co/functions/v1/booking-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_Bn8oxgGqAicN96wMZq93-g_V-YPFTMv',
      'Authorization', 'Bearer sb_publishable_Bn8oxgGqAicN96wMZq93-g_V-YPFTMv'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) AS request_id;
  $$
);

-- Automated booking reminder notifications (24h / 1h driver confirm / company escalation).
-- Applied by: supabase db push / migration deploy (not run automatically by the app).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_24h_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS driver_confirmed_1h boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS company_unconfirmed_alert_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.reminder_24h_sent IS
  'Set true after the ~24h-before Expo push is sent to the assigned driver.';
COMMENT ON COLUMN public.bookings.reminder_1h_sent IS
  'Set true after the ~1h-before confirmation-request push is sent to the driver.';
COMMENT ON COLUMN public.bookings.driver_confirmed_1h IS
  'NULL = no response yet; true = driver confirmed via app; false = explicit decline (reserved).';
COMMENT ON COLUMN public.bookings.reminder_1h_sent_at IS
  'Timestamp when the 1h reminder was sent; used for the 30-minute company escalation window.';
COMMENT ON COLUMN public.bookings.company_unconfirmed_alert_sent IS
  'Set true after the company is alerted that the driver did not confirm within 30 minutes.';

CREATE INDEX IF NOT EXISTS bookings_reminder_candidates_idx
  ON public.bookings (date_display)
  WHERE driver_id IS NOT NULL
    AND status IN ('accepted', 'in_progress', 'confirmed');

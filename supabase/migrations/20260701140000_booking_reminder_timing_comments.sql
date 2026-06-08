-- Document updated reminder timing (logic lives in booking-reminders Edge Function).

COMMENT ON COLUMN public.bookings.reminder_24h_sent IS
  'Set true after the ~12h-before Expo push is sent to the assigned driver (legacy column name).';
COMMENT ON COLUMN public.bookings.reminder_1h_sent IS
  'Set true after the ~1h45m-before confirmation-request push is sent to the driver (legacy column name).';
COMMENT ON COLUMN public.bookings.reminder_1h_sent_at IS
  'When the confirm push was sent; after 24 minutes without driver_confirmed_1h, auto-reassign runs.';
COMMENT ON COLUMN public.bookings.company_unconfirmed_alert_sent IS
  'True after auto-reassign or company fallback alert (prevents repeat escalation).';

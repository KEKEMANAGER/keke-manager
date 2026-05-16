-- Hourly driver availability blocks (booking-assigned or manual).
CREATE TABLE IF NOT EXISTS public.driver_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id text NOT NULL,
  booking_id text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'booking')),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_schedules_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS driver_schedules_driver_time_idx
  ON public.driver_schedules (driver_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS driver_schedules_booking_idx
  ON public.driver_schedules (booking_id)
  WHERE booking_id IS NOT NULL;

ALTER TABLE public.driver_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_schedules_authenticated_all" ON public.driver_schedules;
CREATE POLICY "driver_schedules_authenticated_all" ON public.driver_schedules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "driver_schedules_anon_all" ON public.driver_schedules;
CREATE POLICY "driver_schedules_anon_all" ON public.driver_schedules
  FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_schedules TO anon, authenticated;

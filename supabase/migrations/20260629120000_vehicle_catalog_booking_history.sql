-- Vehicle catalog (makes / models) + booking edit audit

CREATE TABLE IF NOT EXISTS public.vehicle_makes (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('car', 'minivan', 'minibus', 'bus', 'special'))
);

CREATE TABLE IF NOT EXISTS public.vehicle_models (
  id serial PRIMARY KEY,
  make_id integer NOT NULL REFERENCES public.vehicle_makes(id) ON DELETE CASCADE,
  name text NOT NULL,
  body_type text,
  UNIQUE (make_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_models_make ON public.vehicle_models(make_id);

ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS make_id integer REFERENCES public.vehicle_makes(id);
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS model_id integer REFERENCES public.vehicle_models(id);

CREATE TABLE IF NOT EXISTS public.booking_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_history_booking ON public.booking_history(booking_id);

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS driver_update_pending boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS update_change_summary jsonb;

ALTER TABLE public.vehicle_makes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_makes_read_all" ON public.vehicle_makes;
CREATE POLICY "vehicle_makes_read_all" ON public.vehicle_makes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicle_models_read_all" ON public.vehicle_models;
CREATE POLICY "vehicle_models_read_all" ON public.vehicle_models
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "booking_history_read_participants" ON public.booking_history;
CREATE POLICY "booking_history_read_participants" ON public.booking_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_history.booking_id
        AND (
          b.company_id::text = auth.uid()::text
          OR b.driver_id::text = auth.uid()::text
          OR b.host_driver_id::text = auth.uid()::text
        )
    )
  );

DROP POLICY IF EXISTS "booking_history_insert_company" ON public.booking_history;
CREATE POLICY "booking_history_insert_company" ON public.booking_history
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

GRANT SELECT ON public.vehicle_makes TO authenticated;
GRANT SELECT ON public.vehicle_models TO authenticated;
GRANT SELECT, INSERT ON public.booking_history TO authenticated;

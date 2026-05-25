-- Seat capacity per vehicle (driver registration + company driver matching).
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS passenger_capacity integer;

COMMENT ON COLUMN public.vehicles.passenger_capacity IS
  'Maximum passenger seats offered for this vehicle (1–100).';

-- Emergency replacement: flag + stuck-vehicle location for replacement drivers.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_emergency_replacement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS breakdown_location text,
  ADD COLUMN IF NOT EXISTS breakdown_location_type text;

COMMENT ON COLUMN public.bookings.is_emergency_replacement IS
  'True when company assigned a replacement driver via emergency flow.';
COMMENT ON COLUMN public.bookings.breakdown_location IS
  'Text address / place name where the broken-down vehicle is waiting.';
COMMENT ON COLUMN public.bookings.breakdown_location_type IS
  'Structured type for breakdown_location (airport, hotel, address, …).';

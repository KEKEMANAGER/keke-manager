-- Structured pickup/dropoff location types for transfer bookings.
-- Existing rows keep from_location / to_location text as-is; type columns default to NULL
-- (legacy plain-text locations remain valid).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS from_location_type text,
  ADD COLUMN IF NOT EXISTS to_location_type text;

COMMENT ON COLUMN public.bookings.from_location_type IS
  'Pickup location category: airport | train_station | hotel | address. NULL = legacy plain text in from_location.';

COMMENT ON COLUMN public.bookings.to_location_type IS
  'Dropoff location category: airport | train_station | hotel | address. NULL = legacy plain text in to_location.';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_from_location_type_check;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_to_location_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_from_location_type_check
  CHECK (
    from_location_type IS NULL
    OR from_location_type IN ('airport', 'train_station', 'hotel', 'address')
  );

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_to_location_type_check
  CHECK (
    to_location_type IS NULL
    OR to_location_type IN ('airport', 'train_station', 'hotel', 'address')
  );

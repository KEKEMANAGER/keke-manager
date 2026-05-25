-- Guide driver flag (freelance driver who is also a licensed guide).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_guide_driver boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_guide_driver IS
  'True when driver registered as guide-driver (guide + driver with own vehicle).';

-- Company preference when posting open bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requested_driver_category text NOT NULL DEFAULT 'all';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_requested_driver_category_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_requested_driver_category_check
  CHECK (requested_driver_category IN ('all', 'guide', 'own_vehicle'));

COMMENT ON COLUMN public.bookings.requested_driver_category IS
  'Open-job filter: all | guide (is_guide_driver) | own_vehicle (non-guide freelance).';

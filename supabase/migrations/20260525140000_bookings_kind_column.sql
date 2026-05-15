-- Production uses NOT NULL `kind`; keep in sync with `booking_type` where both exist.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS kind text;

UPDATE public.bookings
SET kind = COALESCE(NULLIF(trim(kind), ''), booking_type, 'transfer')
WHERE kind IS NULL OR trim(kind) = '';

UPDATE public.bookings
SET booking_type = kind
WHERE (booking_type IS NULL OR trim(booking_type) = '') AND kind IS NOT NULL;

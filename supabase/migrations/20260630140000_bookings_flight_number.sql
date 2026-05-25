-- Flight number for airport transfers (e.g. PS601, TK301). Idempotent if column already exists.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS flight_number text;

COMMENT ON COLUMN public.bookings.flight_number IS
  'Airline flight number for transfer meet-and-greet; optional.';

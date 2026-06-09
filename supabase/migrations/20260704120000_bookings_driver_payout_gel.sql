-- Fleet: host sets sub-driver pay per booking (snapshot at assignment).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS driver_payout_gel numeric;

COMMENT ON COLUMN public.bookings.driver_payout_gel IS
  'Amount host agrees to pay fleet sub-driver for this trip; set when host assigns via fleet.';

-- Driver payout details + booking payment confirmation (driver confirms receipt).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bank_account text;

COMMENT ON COLUMN public.users.bank_account IS 'Driver IBAN / bank account for company transfers';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by text;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid'));

COMMENT ON COLUMN public.bookings.payment_status IS 'unpaid until driver confirms receipt; paid after driver confirmation';
COMMENT ON COLUMN public.bookings.payment_confirmed_at IS 'When driver confirmed payment received';
COMMENT ON COLUMN public.bookings.payment_confirmed_by IS 'Driver user id who confirmed payment';

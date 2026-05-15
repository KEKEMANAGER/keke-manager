ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS voucher_code text;

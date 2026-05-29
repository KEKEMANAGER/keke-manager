-- Align production `kind` with canonical service codes (matches strict booking_type on legacy DBs).
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_kind_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_kind_check
  CHECK (kind IN ('transfer', 'tour', 'day_tour'));

UPDATE public.bookings
SET kind = CASE
  WHEN booking_type IN ('transfer', 'transfer_arrival', 'transfer_departure') THEN 'transfer'
  WHEN booking_type = 'day_tour' THEN 'day_tour'
  WHEN booking_type = 'tour' THEN 'tour'
  ELSE COALESCE(NULLIF(trim(kind), ''), 'transfer')
END
WHERE kind IS NULL
   OR trim(kind) = ''
   OR kind NOT IN ('transfer', 'tour', 'day_tour');

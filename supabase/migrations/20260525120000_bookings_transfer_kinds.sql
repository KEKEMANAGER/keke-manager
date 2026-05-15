-- Transfer sub-types: arrival vs departure
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_type_check
  CHECK (
    booking_type IN (
      'transfer',
      'transfer_arrival',
      'transfer_departure',
      'tour',
      'day_tour'
    )
  );

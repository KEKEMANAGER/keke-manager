-- The hotel is the first thing a driver asks about and the thing a tour
-- operator's document always states, and until now there was nowhere to put it:
-- the importer could read a full itinerary and every hotel name in it was
-- dropped on the floor.
--
-- Per-night hotels already had a home (`tour_days[].touristHotel`); this is the
-- booking-level one — where a transfer collects the group, or where a day tour
-- starts and ends.
alter table public.bookings
  add column if not exists hotel text;

comment on column public.bookings.hotel is
  'Hotel the group stays at or is collected from, as stated by the operator. Free text.';

-- Multi-day tour itinerary (JSONB array of { day, from, to, stops })

alter table public.bookings
  add column if not exists itinerary jsonb;

-- Transfer wizard: passenger, flight, and commercial pricing fields

alter table public.bookings
  add column if not exists meet_greet boolean default false,
  add column if not exists sign_text text,
  add column if not exists passenger_name text,
  add column if not exists passenger_phone text,
  add column if not exists flight_direction text,
  add column if not exists pickup_time text,
  add column if not exists client_price numeric,
  add column if not exists commission numeric;

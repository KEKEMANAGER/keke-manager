-- Spoken languages on profiles (mirror users) and booking requirements for driver matching.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages text[];

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS required_languages text[];

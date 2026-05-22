-- Driver spoken languages on profiles; booking language requirements for matching.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS languages text[];

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS required_languages text[];

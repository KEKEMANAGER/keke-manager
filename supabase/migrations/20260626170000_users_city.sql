-- Driver / user city (Georgia) for profile and matching filters
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN public.users.city IS 'Georgian city name (e.g. თბილისი)';

CREATE INDEX IF NOT EXISTS users_city_idx ON public.users (city)
  WHERE city IS NOT NULL AND trim(city) <> '';

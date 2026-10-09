-- Where a driver is willing to work.
--
-- NULL and {} both mean "no answer given", and a driver who has not answered
-- is treated as covering everywhere. That is deliberate: most drivers on the
-- platform have never filled this in, and reading silence as "covers nothing"
-- would drop them out of the first dispatch wave overnight. Only a driver who
-- actively narrows their own coverage is ever ranked below a local one.
alter table public.users
  add column if not exists service_regions text[],
  add column if not exists travels_countrywide boolean;

comment on column public.users.service_regions is
  'Region codes this driver serves. NULL or empty = no answer = treated as covering everywhere.';
comment on column public.users.travels_countrywide is
  'Driver accepts multi-day tours anywhere in Georgia, whatever service_regions says.';

-- Dispatch reads these for every candidate driver on every new booking.
create index if not exists users_service_regions_idx
  on public.users using gin (service_regions);

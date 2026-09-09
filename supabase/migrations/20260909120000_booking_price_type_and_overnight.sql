-- Pricing clarity for tours / day tours:
-- - price_includes_fuel: whether the company's price already covers fuel,
--   or is wage-only with fuel handled separately (null = not specified,
--   covers rows created before this feature and transfer bookings).
-- - driver_overnight_by: for multi-day tours, who arranges/pays the
--   driver's overnight stay — KEKE Manager or the company (null = not
--   applicable / not specified).

alter table public.bookings
  add column if not exists price_includes_fuel boolean,
  add column if not exists driver_overnight_by text;

alter table public.bookings
  drop constraint if exists bookings_driver_overnight_by_check;

alter table public.bookings
  add constraint bookings_driver_overnight_by_check
  check (driver_overnight_by is null or driver_overnight_by in ('keke', 'company'));

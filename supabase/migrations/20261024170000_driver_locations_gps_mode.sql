-- How the driver's phone is sending its position, so the company map can say
-- when a pin will freeze as soon as the app is minimized.
--   background  the trip's background task is running: updates keep coming
--               with the app minimized or the screen off
--   foreground  only the open GPS screen is sending: updates stop when the
--               app is minimized
--   null        not reported (an app version from before this column)
alter table public.driver_locations
  add column if not exists gps_mode text check (gps_mode in ('background', 'foreground')),
  add column if not exists gps_mode_at timestamptz;

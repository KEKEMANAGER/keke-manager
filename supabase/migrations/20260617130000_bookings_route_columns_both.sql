-- Align route columns: some projects only have `route`, others only `route_description`.
-- App insert tries `route` first, then `route_description`; having both avoids cache errors.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS route text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS route_description text;

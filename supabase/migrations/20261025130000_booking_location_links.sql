-- A Google Maps link for a transfer's hotel or street address.
--
-- Bookings name their places as text, and the driver's navigation button sent
-- that text to Google Maps to search. A hotel name that is misspelt, or shared
-- by several places, then took the driver to the wrong door. A company may now
-- paste the place's own Google Maps link next to a hotel or an address, and the
-- driver's button opens that exact place.
--
-- Optional: an empty link changes nothing, the name is searched as before.
-- Airports and stations are picked from a fixed list, so they need no link.
-- Tours keep their hotel links inside `tour_days`, `transfer_in` and
-- `transfer_out`, which are already free-form jsonb.

alter table public.bookings
  add column if not exists from_location_link text,
  add column if not exists to_location_link text;

alter table public.bookings
  drop constraint if exists bookings_from_location_link_check,
  add constraint bookings_from_location_link_check check (
    from_location_link is null
    or (char_length(from_location_link) <= 2048 and from_location_link ~* '^https://')
  ),
  drop constraint if exists bookings_to_location_link_check,
  add constraint bookings_to_location_link_check check (
    to_location_link is null
    or (char_length(to_location_link) <= 2048 and to_location_link ~* '^https://')
  );

comment on column public.bookings.from_location_link is
  'Google Maps link for a hotel/address pickup, pasted by the company. Optional.';
comment on column public.bookings.to_location_link is
  'Google Maps link for a hotel/address drop-off, pasted by the company. Optional.';

notify pgrst, 'reload schema';

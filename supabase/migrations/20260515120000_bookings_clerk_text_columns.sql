-- Clerk user IDs are strings (e.g. user_xxx), not UUIDs.
-- If company_id / driver_id were uuid, comparing or inserting Clerk ids causes:
--   invalid input syntax for type uuid

alter table public.bookings
  alter column company_id type text using company_id::text;

alter table public.bookings
  alter column driver_id type text using driver_id::text;

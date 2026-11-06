-- Undo 20261106150000_admin_booking_feed.sql: the admins stop hearing about
-- every booking. The notifications already sent stay (they are the admins'
-- own inbox). Run it as one transaction. It can be run again.
drop trigger if exists bookings_admin_feed on public.bookings;
drop function if exists public.bookings_admin_feed();
drop function if exists public.admin_booking_feed_message(public.bookings, text, uuid);

-- A day tour is stored as a day tour.
--
-- Production's bookings_kind_check allows 'transfer', 'tour' and 'one_day_tour',
-- but nothing writes 'one_day_tour': the apps, the website, the edge functions
-- (booking-import, booking-emails, booking-reminders, price-quote) and the
-- database functions (booking_busy_window, booking_dispatch_message,
-- booking_type_label_ka, dispatch_new_booking_push) all write and read
-- 'day_tour' — as 20260529120000_bookings_kind_check.sql intended. So the
-- database refused every day tour, and the app's insertBooking retried it as
-- kind 'tour', booking_type 'tour': the booking was created, but as a
-- multi-day tour ("ტური" in labels, the history filter, the drivers' new-job
-- message), not a day tour.
--
-- The rule now also allows 'day_tour'. 'one_day_tour' stays allowed (no row
-- uses it, nothing breaks by keeping it). Only the allowed set grows, so every
-- existing booking passes the check unchanged; no booking is rewritten.
--
-- Rollback: supabase/rollback/20261104120000_bookings_kind_day_tour_undo.sql

alter table public.bookings drop constraint if exists bookings_kind_check;
alter table public.bookings
  add constraint bookings_kind_check
  check (kind = any (array['transfer'::text, 'tour'::text, 'day_tour'::text, 'one_day_tour'::text]));

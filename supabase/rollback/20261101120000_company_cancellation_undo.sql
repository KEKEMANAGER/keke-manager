-- Undo P0-5 (20261101120000_company_cancellation).
--
-- Drops the company's cancel function, the guard that keeps a cancelled or
-- completed booking final, and the trigger that drops waiting second-wave
-- pushes, writes the change log and tells the driver. Bookings cancelled
-- meanwhile stay cancelled, their change-log lines and notices stay: undoing
-- it changes no rows. (The calendar is freed by bookings_after_status_change,
-- which P0-5 does not touch.)
--
-- Undo this before P0-4 part A (whose deliver_notification it calls); the
-- P0-4 part A undo refuses while this is in place. The app update that calls
-- cancel_booking_by_company keeps working without it: it falls back to the
-- old direct update, which cancels pending bookings only.

drop trigger if exists bookings_after_cancel on public.bookings;
drop trigger if exists bookings_guard_cancellation on public.bookings;
drop function if exists public.cancel_booking_by_company(uuid, text);
drop function if exists public.sync_convoy_master_status(uuid);
drop function if exists public.bookings_after_cancel();
drop function if exists public.bookings_guard_cancellation();

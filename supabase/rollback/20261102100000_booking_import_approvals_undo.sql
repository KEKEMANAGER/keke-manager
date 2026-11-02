-- Undo 20261102100000_booking_import_approvals.sql.
--
-- Stops the check: bookings with an import_approval_id are then inserted like
-- any other. Nothing is deleted — the column and the approvals stay, so the
-- migration can be applied again without losing which bookings were approved.
-- (An app that still sends import_approval_id keeps working: the column exists.)

drop trigger if exists bookings_verify_import_approval on public.bookings;
drop trigger if exists bookings_keep_import_approval on public.bookings;
drop function if exists public.bookings_verify_import_approval();
drop function if exists public.bookings_keep_import_approval();

-- Fix: app uses `accepted` + `in_progress` but some DBs never ran lifecycle migration (only `confirmed` allowed).
-- Idempotent.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

UPDATE public.bookings SET status = 'accepted' WHERE status = 'confirmed';

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check CHECK (
    status IN (
      'pending',
      'accepted',
      'in_progress',
      'completed',
      'cancelled',
      'rejected'
    )
  );

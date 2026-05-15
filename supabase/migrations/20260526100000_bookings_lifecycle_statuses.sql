-- Booking lifecycle: replace legacy `confirmed` with `accepted`, add `in_progress`; keep `rejected` for driver declines.
-- Auto-touch updated_at on every UPDATE.

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

CREATE OR REPLACE FUNCTION public.bookings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_touch_updated_at ON public.bookings;
CREATE TRIGGER bookings_touch_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE PROCEDURE public.bookings_touch_updated_at();

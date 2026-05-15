-- Allow non-uuid booking keys if needed; uuid values cast cleanly to text.
ALTER TABLE public.ratings
ALTER COLUMN booking_id TYPE text USING (booking_id::text);

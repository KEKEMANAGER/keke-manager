-- Allow missing vehicle class on a booking: treat as "any class" for driver matching / notifications.
ALTER TABLE public.bookings ALTER COLUMN vehicle_class DROP NOT NULL;

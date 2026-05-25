-- Pin the vehicle used for a booking (voucher photos, plate, make/model).
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_vehicle_id_idx ON public.bookings (vehicle_id);

COMMENT ON COLUMN public.bookings.vehicle_id IS
  'Assigned vehicle for this booking; NULL on legacy rows — voucher falls back to driver active vehicle.';

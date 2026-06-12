-- Group / convoy tours: one master booking + N leg bookings (each with own driver).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS parent_booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS leg_index int,
  ADD COLUMN IF NOT EXISTS is_group_master boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_code text;

CREATE INDEX IF NOT EXISTS bookings_parent_booking_id_idx
  ON public.bookings (parent_booking_id)
  WHERE parent_booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_group_master_idx
  ON public.bookings (is_group_master)
  WHERE is_group_master = true;

COMMENT ON COLUMN public.bookings.parent_booking_id IS
  'Leg booking points to group master; master has NULL parent.';
COMMENT ON COLUMN public.bookings.leg_index IS
  '1-based leg number within a group convoy.';
COMMENT ON COLUMN public.bookings.is_group_master IS
  'True for coordinator row (total pax); legs are separate booking rows.';
COMMENT ON COLUMN public.bookings.group_code IS
  'Shared convoy code on master and all legs (e.g. GRP-ABC123).';

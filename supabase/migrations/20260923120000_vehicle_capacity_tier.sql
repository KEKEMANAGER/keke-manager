-- Capacity sub-category for minivan / microbus vehicles, so companies can request
-- an exact seat-count tier (e.g. "3-5 seat minivan" vs "6-8 seat minivan"; microbus
-- 10/13/16/17/18/20-seat variants) and dispatch can match it exactly.
--
-- Nullable everywhere and NOT enforced by a CHECK constraint (same convention as
-- vehicles.type/class — validated in app code via lib/vehicleCatalog.ts) so existing
-- rows and drivers/companies who don't pick a tier keep working exactly as before:
-- matching falls back to type+class only, same as today.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS capacity_tier text;

COMMENT ON COLUMN public.vehicles.capacity_tier IS
  'Optional capacity sub-category for minivan/microbus vehicles (e.g. minivan_3_5, microbus_16). '
  'Canonical codes defined in lib/vehicleCatalog.ts CAPACITY_TIERS. Null = no sub-category set.';

-- `bookings` also covers group/convoy "legs" (rows with parent_booking_id set — see
-- 20260720120000_booking_group_convoy.sql), so this single column covers both single
-- and multi-leg bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requested_capacity_tier text;

COMMENT ON COLUMN public.bookings.requested_capacity_tier IS
  'Optional capacity sub-category the company requested for this booking/leg (minivan/microbus only). '
  'Null = no specific sub-category requested — matches any vehicle of the given type+class, same as before this column existed.';

CREATE INDEX IF NOT EXISTS idx_vehicles_capacity_tier
  ON public.vehicles (capacity_tier)
  WHERE capacity_tier IS NOT NULL;

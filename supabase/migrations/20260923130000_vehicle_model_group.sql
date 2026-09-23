-- Preferred-model filter for minivan/microbus bookings (e.g. request a "Vito" minivan or
-- a "Sprinter" microbus specifically, since most companies only care about these two
-- models and are indifferent to the rest). No column is added to `vehicles` — a
-- vehicle's model group is derived from its existing free-text `model` field in app
-- code (lib/vehicleCatalog.ts vehicleModelGroupFromText) via keyword matching, since
-- drivers already record their real make/model on registration.
--
-- Nullable and NOT enforced by a CHECK constraint (same convention as capacity_tier)
-- so existing bookings and companies who don't pick a preference keep matching exactly
-- as before: any model of the requested type+class(+capacity tier) is fine.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS requested_vehicle_model_group text;

COMMENT ON COLUMN public.bookings.requested_vehicle_model_group IS
  'Optional preferred-model filter requested for this booking/leg (minivan/microbus only, '
  'e.g. vito, sprinter). Canonical codes defined in lib/vehicleCatalog.ts MODEL_GROUPS. '
  'Null = no preference — matches any model, same as before this column existed.';

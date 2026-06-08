-- Grandfather vehicles that existed before vehicles.is_verified was introduced
-- (20260517150100_vehicles_metadata_columns.sql). New rows default to false until reviewed.

-- vehicles had updated_at but no created_at — backfill for cutover logic.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.vehicles
SET created_at = updated_at
WHERE created_at IS NULL;

UPDATE public.vehicles
SET created_at = COALESCE(created_at, updated_at, now());

ALTER TABLE public.vehicles
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.vehicles
  ALTER COLUMN created_at SET NOT NULL;

-- Cutover: when is_verified column was added (migration 20260517150100).
UPDATE public.vehicles
SET is_verified = true
WHERE COALESCE(is_verified, false) = false
  AND created_at < timestamptz '2025-05-17 16:00:00+00';

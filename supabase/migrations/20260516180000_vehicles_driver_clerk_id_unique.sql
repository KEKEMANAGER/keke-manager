-- One vehicle row per driver; enables clean upserts on driver_clerk_id later.
-- Fails if duplicate driver_clerk_id rows already exist — dedupe before applying.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.vehicles'::regclass
      AND conname = 'vehicles_driver_clerk_id_key'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_driver_clerk_id_key UNIQUE (driver_clerk_id);
  END IF;
END $$;

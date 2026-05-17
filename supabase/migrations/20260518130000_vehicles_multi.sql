-- Multi-vehicle support: give each vehicle row a UUID primary key and an
-- is_active flag. Keeps the existing single-row-per-driver data intact by
-- marking those rows active.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF
-- EXISTS, CREATE UNIQUE INDEX … IF NOT EXISTS, DO $$ BEGIN IF EXISTS … END $$).

-- 1. Rename driver_clerk_id → driver_id if the column still has the old name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vehicles'
      AND column_name  = 'driver_clerk_id'
  ) THEN
    ALTER TABLE public.vehicles RENAME COLUMN driver_clerk_id TO driver_id;
  END IF;
END $$;

-- 2. Add uuid id column (future PK).
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Populate any NULL ids (shouldn't happen on a fresh add, but be safe).
UPDATE public.vehicles SET id = gen_random_uuid() WHERE id IS NULL;

-- 3. Drop the old primary key (was on driver_id / driver_clerk_id).
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_pkey;

-- 4. Promote id to primary key.
ALTER TABLE public.vehicles ADD PRIMARY KEY (id);

-- 5. Add is_active flag (default false; existing rows become true below).
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- 6. Every pre-migration row is the only vehicle for its driver → mark active.
UPDATE public.vehicles SET is_active = true WHERE is_active = false;

-- 7. Enforce at most one active vehicle per driver.
DROP INDEX IF EXISTS vehicles_driver_one_active;
CREATE UNIQUE INDEX vehicles_driver_one_active
  ON public.vehicles (driver_id)
  WHERE (is_active = true);

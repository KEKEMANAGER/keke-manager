-- Fix ratings column names so code and schema match:
--   stars → overall        (code always wrote 'overall'; migration created 'stars')
--   company_clerk_id → company_id
--   driver_clerk_id  → driver_id
-- All renames are idempotent (skipped if column already has the target name).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ratings' AND column_name = 'stars'
  ) THEN
    ALTER TABLE public.ratings RENAME COLUMN stars TO overall;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ratings' AND column_name = 'company_clerk_id'
  ) THEN
    ALTER TABLE public.ratings RENAME COLUMN company_clerk_id TO company_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ratings' AND column_name = 'driver_clerk_id'
  ) THEN
    ALTER TABLE public.ratings RENAME COLUMN driver_clerk_id TO driver_id;
  END IF;
END $$;

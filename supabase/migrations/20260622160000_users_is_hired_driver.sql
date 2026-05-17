-- Hired driver (employer's vehicle, no own vehicle registration in KYC).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_hired_driver boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_hired_driver IS
  'True when driver registered as hired driver using employer vehicle.';

-- Migrate legacy is_sub_driver if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_sub_driver'
  ) THEN
    UPDATE public.users
    SET is_hired_driver = COALESCE(is_sub_driver, false)
    WHERE is_sub_driver = true;

    ALTER TABLE public.users DROP COLUMN is_sub_driver;
  END IF;
END $$;

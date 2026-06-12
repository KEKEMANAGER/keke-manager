-- Per-vehicle tech passport (front/back) + admin review workflow.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tech_passport_front text,
  ADD COLUMN IF NOT EXISTS tech_passport_back text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.vehicles.tech_passport_front IS 'Vehicle tech passport — front';
COMMENT ON COLUMN public.vehicles.tech_passport_back IS 'Vehicle tech passport — back';
COMMENT ON COLUMN public.vehicles.verification_status IS 'pending | submitted | approved | rejected';
COMMENT ON COLUMN public.vehicles.rejection_reason IS 'Admin rejection reason for vehicle registration';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_verification_status_check'
  ) THEN
    ALTER TABLE public.vehicles
      ADD CONSTRAINT vehicles_verification_status_check
      CHECK (verification_status IN ('pending', 'submitted', 'approved', 'rejected'));
  END IF;
END $$;

-- Grandfather: already verified vehicles → approved.
UPDATE public.vehicles
SET verification_status = 'approved'
WHERE COALESCE(is_verified, false) = true
  AND verification_status = 'pending';

-- Copy legacy user-level tech passport to each driver's active vehicle (one-time).
UPDATE public.vehicles v
SET
  tech_passport_front = COALESCE(
    NULLIF(trim(v.tech_passport_front), ''),
    NULLIF(trim(u.tech_passport_front), ''),
    NULLIF(trim(u.vehicle_registration_photo), '')
  ),
  tech_passport_back = COALESCE(
    NULLIF(trim(v.tech_passport_back), ''),
    NULLIF(trim(u.tech_passport_back), ''),
    NULLIF(trim(u.tech_passport_front), ''),
    NULLIF(trim(u.vehicle_registration_photo), '')
  )
FROM public.users u
WHERE v.driver_id = u.id
  AND v.is_active = true
  AND (
    u.tech_passport_front IS NOT NULL
    OR u.tech_passport_back IS NOT NULL
    OR u.vehicle_registration_photo IS NOT NULL
  );

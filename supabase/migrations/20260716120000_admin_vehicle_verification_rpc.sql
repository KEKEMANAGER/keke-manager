-- Admin approve/reject vehicle tech passport (bypasses vehicles_update_own RLS).

CREATE OR REPLACE FUNCTION public.admin_approve_vehicle_verification(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = uid AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.vehicles v
  SET
    is_verified = true,
    verification_status = 'approved',
    rejection_reason = null,
    updated_at = now()
  WHERE v.id = p_vehicle_id
    AND v.verification_status = 'submitted'
  RETURNING v.id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_vehicle_verification(
  p_vehicle_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated_id uuid;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = uid AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;

  IF reason IS NULL THEN
    RAISE EXCEPTION 'rejection reason required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.vehicles v
  SET
    is_verified = false,
    verification_status = 'rejected',
    rejection_reason = reason,
    is_active = false,
    updated_at = now()
  WHERE v.id = p_vehicle_id
    AND v.verification_status = 'submitted'
  RETURNING v.id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_vehicle_verification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reject_vehicle_verification(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_vehicle_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_vehicle_verification(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_approve_vehicle_verification IS
  'Admin approves submitted vehicle tech passport verification.';
COMMENT ON FUNCTION public.admin_reject_vehicle_verification IS
  'Admin rejects submitted vehicle tech passport verification.';

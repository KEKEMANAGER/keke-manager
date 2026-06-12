-- Allow first support message to admin (may_message_user previously required prior thread).

CREATE OR REPLACE FUNCTION public.may_message_user(p_receiver uuid, p_booking_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  support_admin uuid;
BEGIN
  IF uid IS NULL OR p_receiver IS NULL OR p_receiver = uid THEN
    RETURN false;
  END IF;
  IF public.is_admin_user() THEN
    RETURN true;
  END IF;

  support_admin := public.get_support_admin_user_id();
  IF support_admin IS NOT NULL AND p_receiver = support_admin THEN
    RETURN true;
  END IF;

  IF p_booking_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.status NOT IN ('cancelled', 'rejected')
      AND (
        (b.company_id::text = uid::text AND (b.driver_id::text = p_receiver::text OR b.host_driver_id = p_receiver))
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_receiver::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_receiver::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  IF public.has_active_booking_with_user(p_receiver) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_fleet f
    WHERE f.status IN ('pending', 'accepted')
      AND (
        (f.host_driver_id = uid AND f.sub_driver_id = p_receiver)
        OR (f.sub_driver_id = uid AND f.host_driver_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE (
        (m.sender_id = uid AND m.receiver_id = p_receiver)
        OR (m.receiver_id = uid AND m.sender_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.may_message_user(uuid, uuid) IS
  'RLS helper: booking chat, fleet, existing threads, and support desk admin.';

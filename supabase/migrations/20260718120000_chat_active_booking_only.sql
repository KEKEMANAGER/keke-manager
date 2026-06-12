-- Chat: only active bookings (not completed) authorize new messages;
-- remove "any prior message" loophole; backfill legacy driver↔company threads.

CREATE OR REPLACE FUNCTION public.has_active_booking_with_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status IN ('accepted', 'confirmed', 'in_progress')
      AND b.driver_id IS NOT NULL
      AND (
        (b.company_id = auth.uid() AND b.driver_id = target_user_id)
        OR (b.driver_id = auth.uid() AND b.company_id = target_user_id)
      )
  );
$$;

COMMENT ON FUNCTION public.has_active_booking_with_user(uuid) IS
  'True when auth user and target share an accepted/confirmed/in_progress booking.';

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
      AND b.status IN ('accepted', 'confirmed', 'in_progress')
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

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.may_message_user(uuid, uuid) IS
  'RLS: booking chat (active booking), fleet, support desk; no legacy thread bypass.';

-- Tag legacy company↔driver messages with their latest shared booking.
UPDATE public.messages m
SET
  thread_type = 'company_driver',
  booking_id = sub.booking_id
FROM (
  SELECT DISTINCT ON (m2.id)
    m2.id AS message_id,
    b.id AS booking_id
  FROM public.messages m2
  JOIN public.bookings b
    ON b.driver_id IS NOT NULL
   AND (
     (b.company_id = m2.receiver_id AND b.driver_id = m2.sender_id)
     OR (b.driver_id = m2.receiver_id AND b.company_id = m2.sender_id)
   )
  WHERE m2.thread_type IS NULL
    AND m2.booking_id IS NULL
  ORDER BY m2.id, b.updated_at DESC
) sub
WHERE m.id = sub.message_id;

-- Clear unread on orphaned legacy messages (no active booking between parties).
UPDATE public.messages m
SET is_read = true
WHERE m.is_read = false
  AND m.thread_type IS DISTINCT FROM 'support'
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status IN ('accepted', 'confirmed', 'in_progress')
      AND b.driver_id IS NOT NULL
      AND (
        (b.company_id = m.receiver_id AND b.driver_id = m.sender_id)
        OR (b.driver_id = m.receiver_id AND b.company_id = m.sender_id)
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.driver_fleet f
    WHERE f.status IN ('pending', 'accepted')
      AND (
        (f.host_driver_id = m.sender_id AND f.sub_driver_id = m.receiver_id)
        OR (f.sub_driver_id = m.sender_id AND f.host_driver_id = m.receiver_id)
      )
  )
  AND m.receiver_id <> COALESCE(public.get_support_admin_user_id(), '00000000-0000-0000-0000-000000000000'::uuid);

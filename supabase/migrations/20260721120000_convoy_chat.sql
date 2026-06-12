-- Group convoy chat: company + all leg drivers on one thread (thread_type = convoy, booking_id = master).

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_thread_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_thread_type_check
  CHECK (
    thread_type IS NULL
    OR thread_type IN (
      'company_host',
      'company_driver',
      'host_driver',
      'support',
      'convoy'
    )
  );

CREATE INDEX IF NOT EXISTS messages_convoy_thread_idx
  ON public.messages (booking_id, created_at ASC)
  WHERE thread_type = 'convoy' AND booking_id IS NOT NULL;

COMMENT ON COLUMN public.messages.thread_type IS
  'company_host | company_driver | host_driver | support | convoy';

CREATE OR REPLACE FUNCTION public.is_convoy_participant(p_master_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings m
    WHERE m.id = p_master_id
      AND m.is_group_master = true
      AND m.company_id::text = p_user::text
  )
  OR EXISTS (
    SELECT 1
    FROM public.bookings leg
    WHERE leg.parent_booking_id = p_master_id
      AND leg.driver_id IS NOT NULL
      AND leg.driver_id::text = p_user::text
  );
$$;

CREATE OR REPLACE FUNCTION public.convoy_chat_open(p_master_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings m
    WHERE m.id = p_master_id
      AND m.is_group_master = true
      AND m.status NOT IN ('cancelled', 'rejected', 'completed')
  )
  AND EXISTS (
    SELECT 1
    FROM public.bookings leg
    WHERE leg.parent_booking_id = p_master_id
      AND leg.driver_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.may_message_convoy_participant(
  p_master_id uuid,
  p_sender uuid,
  p_receiver uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.convoy_chat_open(p_master_id)
    AND public.is_convoy_participant(p_master_id, p_sender)
    AND public.is_convoy_participant(p_master_id, p_receiver)
    AND p_sender IS NOT NULL
    AND p_receiver IS NOT NULL
    AND p_sender <> p_receiver;
$$;

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
  convoy_master uuid;
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

  IF p_booking_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN b.is_group_master = true THEN b.id
        WHEN b.parent_booking_id IS NOT NULL THEN b.parent_booking_id
        ELSE NULL
      END
    INTO convoy_master
    FROM public.bookings b
    WHERE b.id = p_booking_id
    LIMIT 1;

    IF convoy_master IS NOT NULL THEN
      RETURN public.may_message_convoy_participant(convoy_master, uid, p_receiver);
    END IF;
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
  'RLS: booking chat, convoy group chat, fleet, support desk.';

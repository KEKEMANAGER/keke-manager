-- Admin-initiated user deletion with full related-data cleanup (matches self-service delete_user_account scope).

CREATE OR REPLACE FUNCTION public.purge_user_data(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_text text := p_target_id::text;
BEGIN
  DELETE FROM public.messages m
  WHERE m.sender_id = p_target_id
     OR m.receiver_id = p_target_id
     OR m.booking_id IN (
       SELECT b.id
       FROM public.bookings b
       WHERE b.company_id = target_text
          OR b.driver_id = target_text
          OR b.host_driver_id = p_target_id
     );

  DELETE FROM public.bookings b
  WHERE b.company_id = target_text
     OR b.driver_id = target_text
     OR b.host_driver_id = p_target_id;

  DELETE FROM public.ratings r
  WHERE r.company_id = target_text
     OR r.driver_id = target_text;

  DELETE FROM public.driver_schedules ds
  WHERE ds.driver_id = target_text;

  DELETE FROM public.company_members cm
  WHERE cm.company_id = target_text;

  DELETE FROM public.vehicles v
  WHERE v.driver_id = target_text;

  DELETE FROM public.driver_fleet df
  WHERE df.host_driver_id = p_target_id
     OR df.sub_driver_id = p_target_id;

  DELETE FROM public.driver_locations dl
  WHERE dl.driver_id = p_target_id;

  DELETE FROM public.notifications n
  WHERE n.user_id = p_target_id;

  DELETE FROM public.feedbacks f
  WHERE f.user_id = p_target_id;

  DELETE FROM public.profiles p
  WHERE p.id = p_target_id;

  DELETE FROM public.users u
  WHERE u.id = p_target_id;

  DELETE FROM auth.users au
  WHERE au.id = p_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_user_data(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'userId_required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_target_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_delete_self';
  END IF;

  PERFORM public.purge_user_data(p_target_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_delete_user(uuid) IS
  'Permanently deletes a user and related app data; callable only by admins.';

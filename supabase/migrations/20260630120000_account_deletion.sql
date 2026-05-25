-- Self-service account deletion (Apple Guideline 5.1.1(v)).
-- Callable by authenticated users; runs as SECURITY DEFINER to remove auth.users.

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  uid_text text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  uid_text := uid::text;

  -- Messages (participant or on user's bookings)
  DELETE FROM public.messages m
  WHERE m.sender_id = uid
     OR m.receiver_id = uid
     OR m.booking_id IN (
       SELECT b.id
       FROM public.bookings b
       WHERE b.company_id = uid_text
          OR b.driver_id = uid_text
          OR b.host_driver_id = uid
     );

  -- Bookings (company, assigned driver, fleet host)
  DELETE FROM public.bookings b
  WHERE b.company_id = uid_text
     OR b.driver_id = uid_text
     OR b.host_driver_id = uid;

  -- Ratings left by / about this user
  DELETE FROM public.ratings r
  WHERE r.company_id = uid_text
     OR r.driver_id = uid_text;

  DELETE FROM public.driver_schedules ds
  WHERE ds.driver_id = uid_text;

  DELETE FROM public.company_members cm
  WHERE cm.company_id = uid_text;

  DELETE FROM public.vehicles v
  WHERE v.driver_id = uid_text;

  DELETE FROM public.driver_fleet df
  WHERE df.host_driver_id = uid
     OR df.sub_driver_id = uid;

  DELETE FROM public.driver_locations dl
  WHERE dl.driver_id = uid;

  DELETE FROM public.notifications n
  WHERE n.user_id = uid;

  DELETE FROM public.feedbacks f
  WHERE f.user_id = uid;

  DELETE FROM public.profiles p
  WHERE p.id = uid;

  DELETE FROM public.users u
  WHERE u.id = uid;

  DELETE FROM auth.users au
  WHERE au.id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

COMMENT ON FUNCTION public.delete_user_account() IS
  'Permanently deletes the calling user and related app data, then removes auth.users row.';

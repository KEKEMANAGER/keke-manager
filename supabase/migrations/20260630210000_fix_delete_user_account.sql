-- Fix delete_user_account: ratings use company_id/driver_id (not rater_id/rated_id).

CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.bookings WHERE company_id = uid OR driver_id = uid OR host_driver_id = uid;
  DELETE FROM public.vehicles WHERE driver_id = uid;
  DELETE FROM public.driver_fleet WHERE host_driver_id = uid OR sub_driver_id = uid;
  DELETE FROM public.messages WHERE sender_id = uid OR receiver_id = uid;
  DELETE FROM public.ratings WHERE company_id = uid OR driver_id = uid;
  DELETE FROM public.notifications WHERE user_id = uid;
  DELETE FROM public.driver_schedules WHERE driver_id = uid;
  DELETE FROM public.driver_locations WHERE driver_id = uid;
  DELETE FROM public.profiles WHERE id = uid;
  DELETE FROM public.users WHERE id = uid;
  DELETE FROM auth.users WHERE id = uid;
END;
$function$;

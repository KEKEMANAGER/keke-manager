-- Undo of 20261031120000_driver_decline_per_driver.sql: puts back the
-- production definitions captured on 2026-10-31 (verbatim) and removes the
-- decline table. Declines recorded in the meantime are lost with it.
-- Run only on purpose, as one transaction.

CREATE OR REPLACE FUNCTION public.reject_pending_booking_as_driver(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  updated_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_driver_user() THEN
    RAISE EXCEPTION 'driver only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings b
  SET
    status = 'rejected',
    driver_id = NULL,
    driver_display_name = NULL,
    driver_phone = NULL,
    driver_plate = NULL,
    updated_at = now()
  WHERE b.id = p_booking_id
    AND b.status = 'pending'
    AND (
      b.driver_id IS NULL
      OR trim(COALESCE(b.driver_id::text, '')) = ''
      OR b.driver_id::text = uid::text
    )
  RETURNING b.id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$function$;

revoke all on function public.reject_pending_booking_as_driver(uuid) from public;
grant execute on function public.reject_pending_booking_as_driver(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_display_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_plate text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  w record;
  v_vehicle uuid;
  caller uuid := auth.uid();
  allowed boolean := false;
  c_booking uuid;
  c_start timestamptz;
  c_end timestamptz;
  which_busy text;
begin
  if p_booking_id is null or p_driver_id is null then
    return jsonb_build_object('ok', false, 'code', 'bad_input',
      'message', 'ჯავშნის ან მძღოლის id არ არის');
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;

  if caller is not null then
    if caller = p_driver_id then
      allowed := true;
    elsif caller = b.company_id then
      allowed := true;
    elsif public.is_admin_user() then
      allowed := true;
    elsif exists (
      select 1 from public.driver_fleet f
       where f.host_driver_id = caller
         and f.sub_driver_id = p_driver_id
         and f.status = 'accepted'
    ) then
      allowed := true;
    end if;
  end if;

  if not allowed then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ამ ჯავშნის აღების უფლება არ გაქვს');
  end if;

  if b.status is distinct from 'pending' then
    if b.driver_id = p_driver_id and b.status in ('accepted', 'in_progress') then
      return jsonb_build_object('ok', true, 'code', 'already_yours',
        'message', 'ჯავშანი უკვე შენზეა');
    end if;
    return jsonb_build_object('ok', false, 'code', 'not_pending',
      'message', 'ჯავშანი უკვე აღებულია ან მიუწვდომელია');
  end if;

  if b.driver_id is not null and b.driver_id <> p_driver_id then
    return jsonb_build_object('ok', false, 'code', 'taken',
      'message', 'ჯავშანი სხვა მძღოლზეა მიბმული');
  end if;

  v_vehicle := coalesce(p_vehicle_id, b.vehicle_id);

  select * into w from public.booking_busy_window(p_booking_id);
  if w.win_start is null then
    return jsonb_build_object('ok', false, 'code', 'no_window',
      'message', 'ჯავშნის თარიღი ვერ წაიკითხა');
  end if;

  begin
    insert into public.driver_schedules
      (driver_id, vehicle_id, booking_id, start_time, end_time, source)
    values
      (p_driver_id, v_vehicle, p_booking_id, w.win_start, w.win_end, 'booking');
  exception
    when unique_violation then
      update public.driver_schedules
         set driver_id  = p_driver_id,
             vehicle_id = v_vehicle,
             start_time = w.win_start,
             end_time   = w.win_end
       where booking_id = p_booking_id
         and source = 'booking';
    when exclusion_violation then
      select ds.booking_id,
             ds.start_time,
             ds.end_time,
             case when ds.driver_id = p_driver_id then 'driver' else 'vehicle' end
        into c_booking, c_start, c_end, which_busy
        from public.driver_schedules ds
       where tstzrange(ds.start_time, ds.end_time, '[)')
             && tstzrange(w.win_start, w.win_end, '[)')
         and (ds.driver_id = p_driver_id
              or (v_vehicle is not null and ds.vehicle_id = v_vehicle))
       order by (ds.driver_id = p_driver_id) desc, ds.start_time
       limit 1;

      which_busy := coalesce(which_busy, 'driver');

      return jsonb_build_object(
        'ok', false,
        'code', case when which_busy = 'vehicle' then 'vehicle_busy' else 'driver_busy' end,
        'message', case when which_busy = 'vehicle'
                        then 'ეს მანქანა ამ თარიღებზე უკვე სხვა ჯავშანშია'
                        else 'ამ თარიღებზე უკვე გაქვს სხვა ჯავშანი' end,
        'conflictBookingId', c_booking,
        'conflictStart', c_start,
        'conflictEnd', c_end,
        'windowStart', w.win_start,
        'windowEnd', w.win_end
      );
  end;

  update public.bookings
     set driver_id = p_driver_id,
         status = 'accepted',
         driver_display_name = coalesce(nullif(trim(p_display_name), ''), driver_display_name),
         driver_phone        = coalesce(nullif(trim(p_phone), ''), driver_phone),
         driver_plate        = coalesce(nullif(trim(p_plate), ''), driver_plate),
         vehicle_id          = v_vehicle,
         updated_at          = now()
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'code', 'accepted',
    'windowStart', w.win_start, 'windowEnd', w.win_end);
end;
$function$;

revoke all on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

drop policy if exists bookings_select_participants on public.bookings;
create policy bookings_select_participants on public.bookings as PERMISSIVE for SELECT to authenticated using ((((company_id)::text = (auth.uid())::text) OR ((driver_id)::text = (auth.uid())::text) OR (host_driver_id = auth.uid()) OR ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'driver'::text)))) AND (status = 'pending'::text) AND (COALESCE(is_group_master, false) = false) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text))) OR ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'driver'::text)))) AND (status = 'pending'::text) AND (COALESCE(is_group_master, false) = false) AND ((driver_id)::text = (auth.uid())::text))));

drop policy if exists bookings_update_driver_accept on public.bookings;
create policy bookings_update_driver_accept on public.bookings as PERMISSIVE for UPDATE to authenticated using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'driver'::text)))) AND (status = 'pending'::text) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text) OR ((driver_id)::text = (auth.uid())::text)))) with check ((((driver_id)::text = (auth.uid())::text) AND (status = ANY (ARRAY['accepted'::text, 'confirmed'::text]))));

drop policy if exists bookings_update_driver_reject_open on public.bookings;
create policy bookings_update_driver_reject_open on public.bookings as PERMISSIVE for UPDATE to authenticated using ((is_driver_user() AND (status = 'pending'::text) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text) OR ((driver_id)::text = (auth.uid())::text)))) with check (((status = 'rejected'::text) AND ((driver_id IS NULL) OR (TRIM(BOTH FROM COALESCE((driver_id)::text, ''::text)) = ''::text))));

drop table if exists public.booking_driver_declines;

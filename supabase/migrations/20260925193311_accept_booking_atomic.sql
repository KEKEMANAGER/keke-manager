-- Atomic accept: the busy block and the booking update happen in ONE
-- transaction, so the EXCLUDE constraint on driver_schedules makes a double
-- booking physically impossible from every path (driver accepts, host assigns
-- a sub-driver, company assigns directly, admin).
create or replace function public.accept_booking_atomic(
  p_booking_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid default null,
  p_display_name text default null,
  p_phone text default null,
  p_plate text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
$$;

grant execute on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) to authenticated;

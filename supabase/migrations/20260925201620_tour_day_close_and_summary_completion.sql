-- Close one day of a multi-day tour.
create or replace function public.close_tour_day(
  p_booking_id uuid,
  p_day_index integer,
  p_odometer_value numeric default null,
  p_odometer_photo_url text default null,
  p_overnight_place text default null,
  p_extra_costs_gel numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b record;
  caller uuid := auth.uid();
  n integer;
  plan record;
  existing record;
  closed_count integer;
  route text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;

  if caller is null
     or (caller is distinct from b.driver_id and caller is distinct from b.host_driver_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ეს ჯავშანი შენზე არ არის');
  end if;

  if b.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'code', 'not_in_progress',
      'message', 'დღის დახურვა მხოლოდ დაწყებულ ტურზე შეიძლება');
  end if;

  n := public.tour_day_count(p_booking_id);
  if p_day_index is null or p_day_index < 1 or p_day_index > n then
    return jsonb_build_object('ok', false, 'code', 'bad_day',
      'message', 'ასეთი დღე ამ ტურში არ არის');
  end if;

  select * into existing
    from public.booking_day_logs
   where booking_id = p_booking_id and day_index = p_day_index;

  if existing.id is null then
    select * into plan
      from public.tour_day_plan(p_booking_id)
     where tour_day_plan.day_index = p_day_index;

    if not coalesce(plan.can_close, false) then
      if p_day_index > 1 and not exists (
        select 1 from public.booking_day_logs
         where booking_id = p_booking_id and day_index = p_day_index - 1
      ) then
        return jsonb_build_object('ok', false, 'code', 'previous_day_open',
          'message', 'ჯერ წინა დღე დახურე');
      end if;
      return jsonb_build_object('ok', false, 'code', 'too_early',
        'message', 'ეს დღე ჯერ არ დაწყებულა');
    end if;

    insert into public.booking_day_logs (
      booking_id, day_index, day_date, driver_id, closed_at,
      odometer_value, odometer_photo_url, overnight_place, extra_costs_gel, note
    ) values (
      p_booking_id, p_day_index, plan.day_date, b.driver_id, now(),
      p_odometer_value, nullif(trim(p_odometer_photo_url), ''),
      coalesce(nullif(trim(p_overnight_place), ''), plan.planned_overnight),
      p_extra_costs_gel, nullif(trim(p_note), '')
    );
  else
    -- Corrections are allowed on a day already closed; the driver is on the
    -- road and will sometimes tap before reading the odometer properly.
    update public.booking_day_logs
       set odometer_value = coalesce(p_odometer_value, odometer_value),
           odometer_photo_url = coalesce(nullif(trim(p_odometer_photo_url), ''), odometer_photo_url),
           overnight_place = coalesce(nullif(trim(p_overnight_place), ''), overnight_place),
           extra_costs_gel = coalesce(p_extra_costs_gel, extra_costs_gel),
           note = coalesce(nullif(trim(p_note), ''), note),
           updated_at = now()
     where booking_id = p_booking_id and day_index = p_day_index;
  end if;

  select count(*) into closed_count
    from public.booking_day_logs where booking_id = p_booking_id;

  if existing.id is null and b.company_id is not null then
    route := public.booking_route_summary(b.from_location, b.to_location, b.route::text);
    perform public.booking_notify(
      b.company_id,
      'KEKE Manager',
      'დღე ' || p_day_index || '/' || n || ' დახურულია — ' || route,
      'tour_day_closed',
      jsonb_build_object('type', 'tour_day_closed',
                         'bookingId', p_booking_id::text,
                         'dayIndex', p_day_index,
                         'totalDays', n)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case when existing.id is null then 'closed' else 'updated' end,
    'dayIndex', p_day_index,
    'closedDays', closed_count,
    'totalDays', n,
    'allClosed', closed_count >= n
  );
end;
$$;

-- Finish the tour. Refuses while any day is still open.
create or replace function public.complete_tour_booking_as_driver(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b record;
  caller uuid := auth.uid();
  n integer;
  closed_count integer;
  first_odo numeric;
  last_odo numeric;
  total_costs numeric;
  route text;
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;

  if caller is null
     or (caller is distinct from b.driver_id and caller is distinct from b.host_driver_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ეს ჯავშანი შენზე არ არის');
  end if;

  if b.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'code', 'not_in_progress',
      'message', 'ჯავშანი დაწყებული არ არის');
  end if;

  n := public.tour_day_count(p_booking_id);
  select count(*) into closed_count
    from public.booking_day_logs where booking_id = p_booking_id;

  if n > 1 and closed_count < n then
    return jsonb_build_object(
      'ok', false, 'code', 'days_open',
      'message', 'ჯერ ყველა დღე დახურე — დახურულია ' || closed_count || '/' || n,
      'closedDays', closed_count, 'totalDays', n);
  end if;

  select min(odometer_value), max(odometer_value), coalesce(sum(extra_costs_gel), 0)
    into first_odo, last_odo, total_costs
    from public.booking_day_logs where booking_id = p_booking_id;

  update public.bookings
     set status = 'completed', updated_at = now()
   where id = p_booking_id;

  if b.company_id is not null then
    route := public.booking_route_summary(b.from_location, b.to_location, b.route::text);
    perform public.booking_notify(
      b.company_id,
      'KEKE Manager',
      'ტური დასრულდა (' || n || ' დღე) — ' || route,
      'tour_completed',
      jsonb_build_object('type', 'tour_completed',
                         'bookingId', p_booking_id::text,
                         'totalDays', n)
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'completed',
    'totalDays', n,
    'closedDays', closed_count,
    'odometerStart', first_odo,
    'odometerEnd', last_odo,
    'odometerKm', case when first_odo is not null and last_odo is not null
                       then last_odo - first_odo else null end,
    'extraCostsGel', total_costs
  );
end;
$$;

-- The generic completion path must obey the same rule, or the day-by-day
-- requirement would be one tap away from being bypassed.
create or replace function public.complete_in_progress_booking_as_driver(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  updated_id uuid;
  n integer;
  closed_count integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  n := public.tour_day_count(p_booking_id);
  if n > 1 then
    select count(*) into closed_count
      from public.booking_day_logs where booking_id = p_booking_id;
    if closed_count < n then
      raise exception 'TOUR_DAYS_OPEN: ჯერ ყველა დღე დახურე — დახურულია %/%', closed_count, n
        using errcode = 'P0001';
    end if;
  end if;

  update public.bookings b
     set status = 'completed',
         updated_at = now()
   where b.id = p_booking_id
     and b.status = 'in_progress'
     and (lower(trim(b.driver_id::text)) = lower(uid::text) or b.host_driver_id = uid)
  returning b.id into updated_id;

  return updated_id is not null;
end;
$$;

revoke all on function public.close_tour_day(uuid, integer, numeric, text, text, numeric, text) from public, anon;
revoke all on function public.complete_tour_booking_as_driver(uuid) from public, anon;
grant execute on function public.close_tour_day(uuid, integer, numeric, text, text, numeric, text) to authenticated;
grant execute on function public.complete_tour_booking_as_driver(uuid) to authenticated;

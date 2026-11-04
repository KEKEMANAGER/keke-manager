-- Read-only snapshot of PRODUCTION's multi-day tour functions, so the GPS P0
-- tests can run a whole tour (close each day, finish the tour) against the GPS
-- rules. Captured on 2026-11-04 from project brrjuxgxmpgvkddcuaad with SELECT
-- statements only (the GPS backup of that day): code and execute rights, no
-- rows, no secrets. md5 of pg_get_functiondef in production:
--   tour_day_plan(uuid): add5c264ccaf631462caa476fe07eb2b
--   close_tour_day(uuid,integer,numeric,text,text,numeric,text): 90fd623e1ae3ebea02cac175b5c27b80
--   complete_tour_booking_as_driver(uuid): 3fc56f4d8435f808b81730d792153677
-- Function bodies are as in production with line endings normalised to LF.
-- A TEST FIXTURE, not a migration. Loaded after the GPS snapshot.
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.tour_day_plan(p_booking_id uuid)
 RETURNS TABLE(day_index integer, day_date date, from_place text, to_place text, stops text, planned_overnight text, is_closed boolean, can_close boolean, closed_at timestamp with time zone, odometer_value numeric, odometer_photo_url text, overnight_place text, extra_costs_gel numeric, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  n integer;
  i integer;
  td jsonb;
  it jsonb;
  d_date date;
  log record;
  prev_closed boolean := true;
  day_started boolean;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return;
  end if;

  if auth.uid() is null
     or not (
       b.driver_id = auth.uid()
       or b.host_driver_id = auth.uid()
       or b.company_id = auth.uid()
       or public.is_admin_user()
     ) then
    return;
  end if;

  n := public.tour_day_count(p_booking_id);

  for i in 1..n loop
    td := coalesce(b.tour_days, '[]'::jsonb) -> (i - 1);
    it := coalesce(b.itinerary, '[]'::jsonb) -> (i - 1);

    d_date := null;
    if td is not null and (td ->> 'date') is not null then
      begin
        d_date := (td ->> 'date')::date;
      exception when others then
        d_date := null;
      end;
    end if;
    if d_date is null then
      -- fall back to counting forward from the tour start
      d_date := (public.parse_booking_start_ts(b.date_display)
                   at time zone 'Asia/Tbilisi')::date + (i - 1);
    end if;

    select * into log
      from public.booking_day_logs l
     where l.booking_id = p_booking_id and l.day_index = i;

    day_index := i;
    day_date := d_date;
    from_place := coalesce(td ->> 'fromPlace', it ->> 'from');
    to_place := coalesce(td ->> 'toPlace', it ->> 'to');
    stops := coalesce(td ->> 'stops', it ->> 'stops');
    planned_overnight := td ->> 'driverOvernight';

    is_closed := log.id is not null;
    closed_at := log.closed_at;
    odometer_value := log.odometer_value;
    odometer_photo_url := log.odometer_photo_url;
    overnight_place := log.overnight_place;
    extra_costs_gel := log.extra_costs_gel;
    note := log.note;

    -- a day can be closed once its own date has started and the day before it
    -- is already closed; days are closed in order, never out of sequence
    day_started := d_date is null
                   or now() >= (d_date::timestamp at time zone 'Asia/Tbilisi');
    can_close := (not is_closed)
                 and prev_closed
                 and day_started
                 and b.status = 'in_progress';

    prev_closed := is_closed;
    return next;
  end loop;
end;
$function$;
revoke all on function public.tour_day_plan(uuid) from public, anon, authenticated, service_role;
grant execute on function public.tour_day_plan(uuid) to authenticated;
grant execute on function public.tour_day_plan(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.close_tour_day(p_booking_id uuid, p_day_index integer, p_odometer_value numeric DEFAULT NULL::numeric, p_odometer_photo_url text DEFAULT NULL::text, p_overnight_place text DEFAULT NULL::text, p_extra_costs_gel numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function public.close_tour_day(uuid,integer,numeric,text,text,numeric,text) from public, anon, authenticated, service_role;
grant execute on function public.close_tour_day(uuid,integer,numeric,text,text,numeric,text) to authenticated;
grant execute on function public.close_tour_day(uuid,integer,numeric,text,text,numeric,text) to service_role;

CREATE OR REPLACE FUNCTION public.complete_tour_booking_as_driver(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function public.complete_tour_booking_as_driver(uuid) from public, anon, authenticated, service_role;
grant execute on function public.complete_tour_booking_as_driver(uuid) to authenticated;
grant execute on function public.complete_tour_booking_as_driver(uuid) to service_role;


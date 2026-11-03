-- A host's calendar for each of his cars: whole days on which a car is not
-- available (in the garage, lent out, ...). On those days the car is offered
-- no job and no job can be taken with it, so two bookings can never end up on
-- one car.
--
-- A blocked day is a row in driver_schedules, like every other busy time of
-- a car: source 'vehicle', the car's vehicle_id, no driver (the car is busy,
-- not a person — the host and his other cars stay free), from 00:00 to 24:00
-- Tbilisi time. Because it is a row there, what already keeps a car to one job
-- at a time keeps it off a blocked day too, unchanged:
--   * accepting a job with the car (accept_booking_atomic) answers
--     vehicle_busy;
--   * a host handing a job to his driver on that car
--     (reassign_booking_to_driver) is refused;
--   * the replacement search (find_replacement_driver_for_booking) skips it;
--   * the table's own exclusion constraint keeps a blocked day off a day the
--     car is already booked, and a booking off a blocked day.
-- Two places looked only at the driver and are taught to look at the car too:
--   * booking_dispatch_candidates (every dispatch wave and push): a blocked
--     car is not a matching car for that job's days; its driver is still
--     offered the job through another car he may use;
--   * filter_drivers_available_for_window (the company's driver picker): a
--     driver every one of whose cars is blocked for the window is busy.
--
-- Only a host — a driver with two or more vehicles, as the app counts — sets
-- them, for his own cars, through set_vehicle_day_blocked();
-- vehicle_calendar() reads them back, with the days the car is booked.
-- Nobody can write such a row directly: it has no driver_id, which is the only
-- thing the drivers' own policy on driver_schedules lets them write.
--
-- Rollback: supabase/rollback/20261103130000_vehicle_calendar_undo.sql

-- 1. driver_schedules can hold a car's own busy days
alter table public.driver_schedules alter column driver_id drop not null;

alter table public.driver_schedules drop constraint if exists driver_schedules_source_check;
alter table public.driver_schedules add constraint driver_schedules_source_check
  check (source = any (array['booking'::text, 'manual'::text, 'vehicle'::text]));

-- a car's day has a car and no driver or booking; everything else has its driver as before
alter table public.driver_schedules drop constraint if exists driver_schedules_vehicle_day_shape;
alter table public.driver_schedules add constraint driver_schedules_vehicle_day_shape
  check (case when source = 'vehicle'
              then driver_id is null and vehicle_id is not null and booking_id is null
              else driver_id is not null end);

comment on column public.driver_schedules.source is
  'booking: a job the driver took; manual: a time the driver blocked for himself; vehicle: a whole day (Tbilisi) the host blocked for one of his cars (no driver_id).';

-- 2. who may keep a calendar for a car: its owner, when he is a host
create or replace function public.driver_is_host(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- the app's own rule (lib/menuRole.ts isHostDriver): two or more vehicles
  select p_driver_id is not null
     and (select count(*) from public.vehicles v where v.driver_id = p_driver_id) >= 2
$$;

revoke all on function public.driver_is_host(uuid) from public, anon, authenticated;

-- 3. block or free one whole day of a car
create or replace function public.set_vehicle_day_blocked(p_vehicle_id uuid, p_day date, p_blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me      uuid := auth.uid();
  owner   uuid;
  today   date := (now() at time zone 'Asia/Tbilisi')::date;
  d_start timestamptz;
  d_end   timestamptz;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'code', 'not_signed_in');
  end if;
  select v.driver_id into owner from public.vehicles v where v.id = p_vehicle_id;
  if owner is null or owner <> me then
    return jsonb_build_object('ok', false, 'code', 'not_your_vehicle');
  end if;
  if not public.driver_is_host(me) then
    return jsonb_build_object('ok', false, 'code', 'not_a_host');
  end if;
  if p_day is null or p_day < today then
    return jsonb_build_object('ok', false, 'code', 'past_day');
  end if;
  if p_day > today + 400 then
    return jsonb_build_object('ok', false, 'code', 'too_far');
  end if;

  d_start := p_day::timestamp at time zone 'Asia/Tbilisi';
  d_end   := (p_day + 1)::timestamp at time zone 'Asia/Tbilisi';

  if coalesce(p_blocked, false) then
    if exists (select 1 from public.driver_schedules s
                where s.source = 'vehicle' and s.vehicle_id = p_vehicle_id
                  and s.start_time = d_start and s.end_time = d_end) then
      return jsonb_build_object('ok', true, 'blocked', true);
    end if;
    begin
      insert into public.driver_schedules (driver_id, vehicle_id, booking_id, start_time, end_time, source)
      values (null, p_vehicle_id, null, d_start, d_end, 'vehicle');
    exception when exclusion_violation then
      -- the car already has a job that day (driver_schedules_no_vehicle_overlap)
      return jsonb_build_object('ok', false, 'code', 'vehicle_has_booking');
    end;
    return jsonb_build_object('ok', true, 'blocked', true);
  end if;

  delete from public.driver_schedules s
   where s.source = 'vehicle' and s.vehicle_id = p_vehicle_id
     and s.start_time = d_start and s.end_time = d_end;
  return jsonb_build_object('ok', true, 'blocked', false);
end;
$fn$;

revoke all on function public.set_vehicle_day_blocked(uuid, date, boolean) from public, anon;
grant execute on function public.set_vehicle_day_blocked(uuid, date, boolean) to authenticated;

-- 4. a car's calendar for its owner: the days it is blocked or booked
create or replace function public.vehicle_calendar(p_vehicle_id uuid, p_from date, p_to date)
returns table (day date, status text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null
     or not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.driver_id = auth.uid())
     or p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    return;
  end if;
  return query
    select d.day,
           case when bool_or(s.source = 'booking') then 'booked' else 'blocked' end
      from (select g::date as day from generate_series(p_from, p_to, interval '1 day') g) d
      join public.driver_schedules s
        on s.vehicle_id = p_vehicle_id
       and s.source in ('vehicle', 'booking')
       and s.start_time < (d.day + 1)::timestamp at time zone 'Asia/Tbilisi'
       and s.end_time   > d.day::timestamp at time zone 'Asia/Tbilisi'
     group by d.day
     order by d.day;
end;
$fn$;

revoke all on function public.vehicle_calendar(uuid, date, date) from public, anon;
grant execute on function public.vehicle_calendar(uuid, date, date) to authenticated;

-- 5. dispatch: a car blocked for the job's days is not a matching car
create or replace function public.booking_dispatch_candidates(p_booking_id uuid)
returns table (candidate_id uuid, is_local boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b       public.bookings;
  w_start timestamptz;
  w_end   timestamptz;
  v_class text;
  v_rank  int;
  v_city  text;
begin
  select * into b from public.bookings x where x.id = p_booking_id;
  if not found or b.status is distinct from 'pending' then
    return;
  end if;

  begin
    select bw.win_start, bw.win_end
      into w_start, w_end
      from public.booking_busy_window(p_booking_id) bw;
  exception when others then
    w_start := null;
    w_end   := null;
  end;

  v_class := nullif(trim(coalesce(b.vehicle_class, '')), '');
  v_rank  := public.vehicle_class_rank(v_class);
  v_city  := public.booking_start_city(p_booking_id);

  return query
    with matching_vehicles as (
      select v.id, v.driver_id
        from public.vehicles v
       where v.is_active = true
         and v.is_verified = true
         and v.verification_status = 'approved'
         and v.type = b.vehicle_type
         and (
           v_class is null
           or v.class = v_class
           or (
             v_rank is not null
             and public.vehicle_class_rank(v.class) is not null
             and public.vehicle_class_rank(v.class) >= v_rank
           )
         )
         and (nullif(trim(coalesce(b.requested_capacity_tier, '')), '') is null
              or v.capacity_tier = b.requested_capacity_tier)
         -- a car its host marked unavailable for the job's days is not offered
         and (w_start is null or w_end is null or not exists (
               select 1 from public.driver_schedules vb
                where vb.source = 'vehicle'
                  and vb.vehicle_id = v.id
                  and vb.start_time < w_end
                  and vb.end_time   > w_start))
    ),
    candidate_ids as (
      select mv.driver_id as id from matching_vehicles mv where mv.driver_id is not null
      union
      select f.sub_driver_id
        from public.driver_fleet f
        join matching_vehicles mv on mv.id = f.vehicle_id
       where f.status = 'accepted' and f.sub_driver_id is not null
    )
    select c.id,
           (
             v_city is null
             or public.driver_city_key(c.id) = v_city
             or exists (
               select 1
                 from public.driver_schedules s
                 join public.bookings pb on pb.id = s.booking_id
                where s.driver_id = c.id
                  and w_start is not null
                  and s.end_time <= w_start
                  and s.end_time >= w_start - interval '3 hours'
                  and pb.status in ('accepted', 'in_progress', 'completed')
                  and public.city_key(pb.to_location) = v_city
             )
           )
      from candidate_ids c
      left join public.users u    on u.id = c.id
      left join public.profiles p on p.id = c.id
     where (b.driver_id is null or c.id = b.driver_id)
       and c.id is distinct from b.company_id
       -- P0-4: only drivers who may take jobs (P0-3) ...
       and public.driver_can_take_jobs(c.id)
       -- ... and never one who declined this job (P0-1)
       and not exists (
         select 1 from public.booking_driver_declines dd
          where dd.booking_id = b.id
            and dd.driver_id = c.id
       )
       and (b.driver_id is not null or coalesce(u.is_hired_driver, false) = false)
       and (
         coalesce(nullif(trim(b.requested_driver_category), ''), 'all') = 'all'
         or (
           coalesce(u.is_hired_driver, false) = false
           and (
             (b.requested_driver_category = 'guide'
                and coalesce(u.is_guide_driver, false) = true)
             or (b.requested_driver_category = 'own_vehicle'
                and coalesce(u.is_guide_driver, false) = false)
           )
         )
       )
       and (
         b.required_languages is null
         or array_length(b.required_languages, 1) is null
         or coalesce(u.languages, p.languages, array[]::text[]) && b.required_languages
       )
       and (
         w_start is null
         or w_end is null
         or not exists (
           select 1
             from public.driver_schedules ds
            where ds.driver_id = c.id
              and ds.booking_id is distinct from b.id
              and ds.start_time < w_end
              and ds.end_time   > w_start
         )
       );
end;
$$;

-- 6. the company's driver picker: a driver every one of whose cars is blocked for the window is busy
create or replace function public.filter_drivers_available_for_window(
  p_driver_ids text[],
  p_range_start timestamp with time zone,
  p_range_end timestamp with time zone,
  p_buffer_ms bigint default 1800000)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  with expanded as (
    select
      p_range_start - make_interval(secs => (p_buffer_ms::double precision / 1000.0)) as win_start,
      p_range_end + make_interval(secs => (p_buffer_ms::double precision / 1000.0)) as win_end
  ),
  busy as (
    select distinct ds.driver_id::text
    from public.driver_schedules ds
    cross join expanded e
    where ds.driver_id::text = any (coalesce(p_driver_ids, array[]::text[]))
      and ds.start_time < e.win_end
      and ds.end_time > e.win_start
  ),
  usable as (
    -- the cars a driver may take a job with (vehicle_usable_by_driver)
    select d as driver_id, v.id as vehicle_id
      from unnest(coalesce(p_driver_ids, array[]::text[])) as d
      join public.vehicles v
        on v.verification_status = 'approved'
       and ((v.driver_id::text = d and v.is_active = true)
            or exists (select 1 from public.driver_fleet f
                        where f.sub_driver_id::text = d
                          and f.vehicle_id = v.id
                          and f.status = 'accepted'))
  ),
  usable_state as (
    select u.driver_id,
           exists (select 1
                     from public.driver_schedules vb
                     cross join expanded e
                    where vb.source = 'vehicle'
                      and vb.vehicle_id = u.vehicle_id
                      and vb.start_time < e.win_end
                      and vb.end_time > e.win_start) as blocked
      from usable u
  ),
  car_blocked as (
    -- every car he may use is blocked (a driver with no usable car is left as before)
    select driver_id from usable_state group by driver_id having bool_and(blocked)
  )
  select coalesce(
    array_agg(d order by d),
    array[]::text[]
  )
  from unnest(coalesce(p_driver_ids, array[]::text[])) as d
  where not exists (select 1 from busy b where b.driver_id = d)
    and not exists (select 1 from car_blocked c where c.driver_id = d);
$function$;

revoke all on function public.filter_drivers_available_for_window(text[], timestamptz, timestamptz, bigint) from public, anon;
grant execute on function public.filter_drivers_available_for_window(text[], timestamptz, timestamptz, bigint) to authenticated, service_role;

-- 7. a deleted car takes its calendar with it
create or replace function public.vehicles_drop_calendar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.driver_schedules where source = 'vehicle' and vehicle_id = old.id;
  return null;
end;
$fn$;

revoke all on function public.vehicles_drop_calendar() from public, anon, authenticated;

drop trigger if exists vehicles_drop_calendar on public.vehicles;
create trigger vehicles_drop_calendar
  after delete on public.vehicles
  for each row execute function public.vehicles_drop_calendar();

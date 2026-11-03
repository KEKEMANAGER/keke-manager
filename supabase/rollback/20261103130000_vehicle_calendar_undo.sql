-- Undo 20261103130000_vehicle_calendar.sql.
--
-- The hosts' blocked days are removed (they are rows only this migration
-- could make, and the old constraints would not take them back), the two
-- functions that learned about them are put back as they were, and
-- driver_schedules is as before. Bookings and the drivers' own calendars are
-- not touched.
begin;

drop trigger if exists vehicles_drop_calendar on public.vehicles;
drop function if exists public.vehicles_drop_calendar();
drop function if exists public.vehicle_calendar(uuid, date, date);
drop function if exists public.set_vehicle_day_blocked(uuid, date, boolean);
drop function if exists public.driver_is_host(uuid);

delete from public.driver_schedules where source = 'vehicle';

alter table public.driver_schedules drop constraint if exists driver_schedules_vehicle_day_shape;
alter table public.driver_schedules drop constraint if exists driver_schedules_source_check;
alter table public.driver_schedules add constraint driver_schedules_source_check
  check (source = any (array['booking'::text, 'manual'::text]));
alter table public.driver_schedules alter column driver_id set not null;
comment on column public.driver_schedules.source is null;

-- booking_dispatch_candidates as it was (supabase/migrations/20261101090000_push_tokens_server_delivery.sql)
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

-- filter_drivers_available_for_window as it was in production on 2026-11-03
create or replace function public.filter_drivers_available_for_window(p_driver_ids text[], p_range_start timestamp with time zone, p_range_end timestamp with time zone, p_buffer_ms bigint default 1800000)
 returns text[]
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH expanded AS (
    SELECT
      p_range_start - make_interval(secs => (p_buffer_ms::double precision / 1000.0)) AS win_start,
      p_range_end + make_interval(secs => (p_buffer_ms::double precision / 1000.0)) AS win_end
  ),
  busy AS (
    SELECT DISTINCT ds.driver_id::text
    FROM public.driver_schedules ds
    CROSS JOIN expanded e
    WHERE ds.driver_id::text = ANY (COALESCE(p_driver_ids, ARRAY[]::text[]))
      AND ds.start_time < e.win_end
      AND ds.end_time > e.win_start
  )
  SELECT COALESCE(
    array_agg(d ORDER BY d),
    ARRAY[]::text[]
  )
  FROM unnest(COALESCE(p_driver_ids, ARRAY[]::text[])) AS d
  WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.driver_id = d);
$function$;

commit;

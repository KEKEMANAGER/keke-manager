-- The replacement search previously ignored THREE things:
--   1. the driver's real schedule — it could hand a booking to a busy driver
--   2. the vehicle's schedule
--   3. the driver's rank score — it sorted by an availability flag and a name
drop function if exists public.find_replacement_driver_for_booking(uuid, uuid);

create function public.find_replacement_driver_for_booking(
  p_booking_id uuid,
  p_exclude_driver_id uuid
)
returns table(
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_id uuid,
  vehicle_plate text,
  rank_score numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with b as (
    select
      bo.id,
      lower(trim(bo.vehicle_type)) as vt,
      lower(trim(bo.vehicle_class)) as vc,
      bo.requested_driver_category,
      bo.required_languages
    from public.bookings bo
    where bo.id = p_booking_id
  ),
  w as (
    select bw.win_start, bw.win_end from public.booking_busy_window(p_booking_id) bw
  ),
  candidates as (
    select
      u.id as did,
      u.full_name as fname,
      u.phone as fphone,
      v.id as vid,
      v.plate as vplate,
      coalesce(u.is_available, false) as is_avail,
      u.available_updated_at as avail_at
    from b
    cross join w
    join public.vehicles v
      on lower(trim(v.type)) = b.vt
     and lower(trim(v.class)) = b.vc
     and coalesce(v.is_active, true) = true
    join public.users u on u.id = v.driver_id
    where b.vt <> '' and b.vc <> ''
      and u.role = 'driver'
      and coalesce(u.is_verified, false) = true
      and coalesce(u.is_blocked, false) = false
      and u.id is distinct from p_exclude_driver_id
      and public.driver_matches_booking_category(
            u.is_guide_driver, u.is_hired_driver, b.requested_driver_category)
      and public.driver_matches_required_languages(u.languages, b.required_languages)
      and not exists (
        select 1 from public.driver_schedules ds
         where ds.driver_id = u.id
           and ds.booking_id is distinct from p_booking_id
           and tstzrange(ds.start_time, ds.end_time, '[)')
               && tstzrange(w.win_start, w.win_end, '[)')
      )
      and not exists (
        select 1 from public.driver_schedules ds2
         where ds2.vehicle_id = v.id
           and ds2.booking_id is distinct from p_booking_id
           and tstzrange(ds2.start_time, ds2.end_time, '[)')
               && tstzrange(w.win_start, w.win_end, '[)')
      )
  )
  select c.did, c.fname, c.fphone, c.vid, c.vplate, s.rank_score
  from candidates c
  join public.driver_rank_scores() s on s.driver_id = c.did
  order by s.rank_score desc,
           c.is_avail desc,
           s.last_dispatched_at asc nulls first,
           c.avail_at desc nulls last,
           c.fname asc nulls last
  limit 1;
$$;

grant execute on function public.find_replacement_driver_for_booking(uuid, uuid) to authenticated;

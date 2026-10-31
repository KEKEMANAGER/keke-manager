-- P0-3 (part A) · Only drivers KEKE approved take bookings, and no direct
-- write can get around that.
--
-- Before (production, and still after P0-1 / P0-2):
--   * Every signed-in driver account — unapproved, rejected, blocked, or with
--     no approved car — could read every open booking in full (passenger name
--     and phone, meeting contact, pickup sign, the company's own notes and
--     prices) through the table, its realtime feed and its change log.
--   * accept_booking_atomic() put any driver on a job: it checked who pressed
--     the button, never whether that driver was approved, and took any car id
--     it was given, someone else's included.
--   * A driver could take a job with a plain UPDATE (bookings_update_driver_accept),
--     skipping the calendar check, and the assigned driver could rewrite any
--     column of his booking — the company's price included — because the
--     update rules' checks are ORed and one of them is WITH CHECK (true).
--   * A driver could mark his own car approved, and a blocked account could
--     lift its own block, so "approved" and "not blocked" were not facts.
--   * The automatic replacement (run_booking_reminders) could pick a driver
--     who had declined that very job, or one whose car was never approved.
--   * Anyone with the public key could list every pickup-sign file.
--
-- After this part:
--   * driver_can_take_jobs(): driver role, not blocked, verified, and an
--     approved car that is active (or the approved car his fleet owner gave
--     him). accept_booking_atomic() requires it for every caller except an
--     admin, and refuses a car the driver may not use. It also takes
--     simultaneous accepts for one driver or one car one after the other, so
--     an overlap is always answered driver_busy / vehicle_busy (before, two
--     accepts landing in the same instant could end in a deadlock error).
--   * Open bookings, and offers made to one driver, are visible only to
--     drivers who pass that check. Approved drivers still read them through
--     the table, so the app versions installed today keep working; part B
--     (supabase/staged/) takes that away once the app update is out.
--   * driver_open_jobs(): the safe summary of open jobs and offers — route,
--     dates, places, vehicle requirements, itinerary and the company's price;
--     no passenger, contact, sign, note, client price, commission or voucher.
--   * A trigger refuses direct API writes that bypass the server functions:
--     no driver is put on a job except by accept_booking_atomic(); a driver
--     changes only his trip's progress (start, finish, cancel, odometer,
--     "payment received", "update seen") and never a price.
--   * Car approval and an account block can be changed only by an admin.
--   * The replacement search skips drivers who declined the job and cars that
--     are not approved.
--   * Pickup-sign files: only the company, its booking's assigned driver and
--     admins can list them. Their public links keep working as before.
--
-- Needs P0-1 and P0-2 applied first (checked below). Changes no rows.
-- Undo: supabase/rollback/20261031180000_driver_eligibility_undo.sql
-- Tests: supabase/tests/run_p0_3_tests.sh (see supabase/tests/README.md)

-- 0. Preflight: stop if a definition this migration replaces is not the one
--    it was written against (fingerprints of the body with CRs removed).
do $$
declare
  expected constant jsonb := jsonb_build_object(
    'accept_booking_atomic',               '05753624c5db6b0fe2f74ab1be7371e6',  -- as left by P0-1
    'find_replacement_driver_for_booking', '73f679af8ed9fa110317dcdab4610fdf',  -- production, 31 Oct 2026
    'guard_users_privileged_columns',      'b430cecfd94660070751f106fa4ba163'); -- production, 31 Oct 2026
  k text;
  got text;
begin
  if to_regclass('public.booking_driver_declines') is null then
    raise exception 'P0-3 stopped: apply P0-1 (20261031120000_driver_decline_per_driver) first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'bookings'
                    and column_name = 'auto_reassigned_at') then
    raise exception 'P0-3 stopped: apply P0-2 (20261031150000_reminder_reassign_once) first';
  end if;
  for k in select jsonb_object_keys(expected) loop
    select md5(replace(p.prosrc, E'\r', '')) into got
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = k;
    if got is distinct from expected ->> k then
      raise exception 'P0-3 stopped: public.%() is not the version this migration was written against (found %, expected %)',
        k, got, expected ->> k;
    end if;
  end loop;
end
$$;

-- 1. Who may take jobs ------------------------------------------------------

-- The account: a driver, not blocked, verified by KEKE. A rejected verdict
-- wins over a stale is_verified flag.
create or replace function public.driver_account_approved(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.users u
     where u.id = p_driver_id
       and u.role = 'driver'
       and coalesce(u.is_blocked, false) = false
       and coalesce(u.is_verified, false) = true
       and lower(btrim(coalesce(u.verification_status, 'approved'))) = 'approved'
  );
$$;

-- A car the driver may take a job with: his own, approved and active, or the
-- approved car his fleet owner gave him (an accepted fleet link).
create or replace function public.vehicle_usable_by_driver(p_vehicle_id uuid, p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.vehicles v
     where v.id = p_vehicle_id
       and v.verification_status = 'approved'
       and (
         (v.driver_id = p_driver_id and v.is_active = true)
         or exists (
           select 1 from public.driver_fleet f
            where f.sub_driver_id = p_driver_id
              and f.vehicle_id = v.id
              and f.status = 'accepted'
         )
       )
  );
$$;

create or replace function public.driver_can_take_jobs(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.driver_account_approved(p_driver_id)
     and exists (
       select 1
         from public.vehicles v
        where v.verification_status = 'approved'
          and (
            (v.driver_id = p_driver_id and v.is_active = true)
            or exists (
              select 1 from public.driver_fleet f
               where f.sub_driver_id = p_driver_id
                 and f.vehicle_id = v.id
                 and f.status = 'accepted'
            )
          )
     );
$$;

-- For the read rules: the signed-in caller only, so nobody can probe
-- someone else's status through it.
create or replace function public.current_driver_can_take_jobs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.driver_can_take_jobs(auth.uid());
$$;

revoke all on function public.driver_account_approved(uuid) from public, anon, authenticated;
revoke all on function public.vehicle_usable_by_driver(uuid, uuid) from public, anon, authenticated;
revoke all on function public.driver_can_take_jobs(uuid) from public, anon, authenticated;
revoke all on function public.current_driver_can_take_jobs() from public, anon;
grant execute on function public.driver_account_approved(uuid) to service_role;
grant execute on function public.vehicle_usable_by_driver(uuid, uuid) to service_role;
grant execute on function public.driver_can_take_jobs(uuid) to service_role;
grant execute on function public.current_driver_can_take_jobs() to authenticated, service_role;

-- 2. What a driver sees of a job before it is his ---------------------------

create or replace function public.booking_summary_pick(p_obj jsonb, p_keys text[])
returns jsonb
language sql
immutable
as $$
  select case when jsonb_typeof(p_obj) = 'object' then
    coalesce((select jsonb_object_agg(e.key, e.value)
                from jsonb_each(p_obj) e
               where e.key = any (p_keys)), '{}'::jsonb)
  end;
$$;

create or replace function public.booking_summary_pick_each(p_arr jsonb, p_keys text[])
returns jsonb
language sql
immutable
as $$
  select case when jsonb_typeof(p_arr) = 'array' then
    coalesce((select jsonb_agg(public.booking_summary_pick(e.value, p_keys) order by e.ord)
                from jsonb_array_elements(p_arr) with ordinality as e(value, ord)
               where jsonb_typeof(e.value) = 'object'), '[]'::jsonb)
  end;
$$;

-- An allow-list: a column added to bookings later stays hidden until it is
-- added here on purpose. Places are given by name; exact map links, flight
-- numbers, passenger names, contacts, the pickup sign, free-text notes, the
-- client's price, commission, voucher and payment details come with the job.
create or replace function public.booking_open_job_summary(b public.bookings)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
      'id', b.id,
      'created_at', b.created_at,
      'updated_at', b.updated_at,
      'company_id', b.company_id,
      'company_name', b.company_name,
      'driver_id', b.driver_id,
      'vehicle_id', b.vehicle_id,
      'kind', b.kind,
      'booking_type', b.booking_type,
      'status', b.status,
      'date_display', b.date_display,
      'start_date', b.start_date,
      'end_date', b.end_date,
      'pickup_time', b.pickup_time,
      'flight_direction', b.flight_direction,
      'from_location', b.from_location,
      'from_location_type', b.from_location_type,
      'to_location', b.to_location,
      'to_location_type', b.to_location_type,
      'hotel', b.hotel,
      'route', case when jsonb_typeof(b.route) = 'string' then b.route end,
      'breakdown_location', b.breakdown_location,
      'breakdown_location_type', b.breakdown_location_type)
    || jsonb_build_object(
      'passengers', b.passengers,
      'luggage', b.luggage,
      'vehicle_type', b.vehicle_type,
      'vehicle_class', b.vehicle_class,
      'requested_capacity_tier', b.requested_capacity_tier,
      'requested_vehicle_model_group', b.requested_vehicle_model_group,
      'required_languages', b.required_languages,
      'requested_driver_category', b.requested_driver_category,
      'price_gel', b.price_gel,
      'price_includes_fuel', b.price_includes_fuel,
      'driver_overnight_by', b.driver_overnight_by,
      'overnight', b.overnight,
      'meet_greet', b.meet_greet,
      'has_banner', b.has_banner,
      'is_emergency_replacement', b.is_emergency_replacement,
      'parent_booking_id', b.parent_booking_id,
      'leg_index', b.leg_index,
      'group_code', b.group_code,
      'is_group_master', b.is_group_master,
      'tour_days', public.booking_summary_pick_each(b.tour_days,
        array['day', 'date', 'fromPlace', 'toPlace', 'stops', 'touristHotel', 'driverOvernight', 'overnight']),
      'itinerary', public.booking_summary_pick_each(b.itinerary,
        array['day', 'from', 'to', 'stops']),
      'transfer_in', public.booking_summary_pick(b.transfer_in,
        array['date', 'airport', 'airport_type', 'hotel', 'hotel_type']),
      'transfer_out', public.booking_summary_pick(b.transfer_out,
        array['date', 'airport', 'airport_type', 'hotel', 'hotel_type']));
$$;

revoke all on function public.booking_summary_pick(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.booking_summary_pick_each(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.booking_open_job_summary(public.bookings) from public, anon, authenticated;
grant execute on function public.booking_summary_pick(jsonb, text[]) to service_role;
grant execute on function public.booking_summary_pick_each(jsonb, text[]) to service_role;
grant execute on function public.booking_open_job_summary(public.bookings) to service_role;

-- The open jobs the caller may take and the offers made to him, as summaries.
-- Empty for anyone driver_can_take_jobs() refuses. One job: p_booking_id.
create or replace function public.driver_open_jobs(p_booking_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.driver_can_take_jobs(me) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.booking_open_job_summary(b) order by b.created_at desc)
      from public.bookings b
     where b.status = 'pending'
       and coalesce(b.is_group_master, false) = false
       and (p_booking_id is null or b.id = p_booking_id)
       and (
         b.driver_id = me
         or (
           b.driver_id is null
           and not exists (
             select 1 from public.booking_driver_declines d
              where d.booking_id = b.id
                and d.driver_id = me
           )
         )
       )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.driver_open_jobs(uuid) from public, anon;
grant execute on function public.driver_open_jobs(uuid) to authenticated, service_role;

-- 3. Accepting: the P0-1 function plus the two P0-3 checks --------------------

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

  -- P0-3: only a driver KEKE approved, who is not blocked and has an
  -- approved, active car, is put on a job — whoever presses the button: the
  -- driver, his fleet owner or the company. Only an admin may override. The
  -- share lock means an admin's block landing at this very moment either waits
  -- for this accept or is seen by it.
  if not public.is_admin_user() then
    perform 1 from public.users u where u.id = p_driver_id for share;
    if not public.driver_can_take_jobs(p_driver_id) then
      return jsonb_build_object('ok', false, 'code', 'not_eligible',
        'message', case when caller = p_driver_id
          then 'ჯავშნის აღება ჯერ არ შეგიძლია — ამისთვის საჭიროა გავლილი ვერიფიკაცია და დადასტურებული, აქტიური მანქანა'
          else 'ამ მძღოლს ჯავშნის აღება ჯერ არ შეუძლია — საჭიროა გავლილი ვერიფიკაცია და დადასტურებული, აქტიური მანქანა'
        end);
    end if;
    -- a fleet owner taking a job for his driver must be approved himself
    if caller is distinct from p_driver_id
       and caller is distinct from b.company_id
       and not public.driver_account_approved(caller) then
      return jsonb_build_object('ok', false, 'code', 'not_eligible',
        'message', 'ჯავშნის აღება ჯერ არ შეგიძლია — შენი ანგარიში დადასტურებული არ არის ან დაბლოკილია');
    end if;
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

  -- P0-1: a driver who declined this open job cannot take it back, neither
  -- himself nor through his fleet owner. The company or an admin can still
  -- give it to him on purpose.
  if b.driver_id is null
     and caller is distinct from b.company_id
     and not public.is_admin_user()
     and exists (
       select 1 from public.booking_driver_declines d
        where d.booking_id = p_booking_id
          and d.driver_id = p_driver_id
     ) then
    return jsonb_build_object('ok', false, 'code', 'declined',
      'message', 'ეს ჯავშანი უარყავი, ამიტომ მისი აღება აღარ შეგიძლია');
  end if;

  v_vehicle := coalesce(p_vehicle_id, b.vehicle_id);

  -- P0-3: the car on the job must be one this driver may use — his own,
  -- active and approved, or the approved car his fleet owner gave him.
  if v_vehicle is not null
     and not public.is_admin_user()
     and not public.vehicle_usable_by_driver(v_vehicle, p_driver_id) then
    return jsonb_build_object('ok', false, 'code', 'vehicle_not_allowed',
      'message', 'ამ მანქანით ჯავშნის აღება არ შეიძლება — მანქანა უნდა იყოს მძღოლის, აქტიური და დადასტურებული');
  end if;

  -- P0-3: one accept at a time per driver and per car. Two simultaneous
  -- accepts that overlap then meet the calendar rule one after the other and
  -- the second gets driver_busy / vehicle_busy, instead of both waiting on
  -- each other inside the no-overlap check until Postgres aborts one with a
  -- deadlock error.
  perform pg_advisory_xact_lock(hashtextextended('accept_booking_atomic:driver:' || p_driver_id::text, 0));
  if v_vehicle is not null then
    perform pg_advisory_xact_lock(hashtextextended('accept_booking_atomic:vehicle:' || v_vehicle::text, 0));
  end if;

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

-- 4. Automatic replacement: production search plus the two P0-3 conditions --

CREATE OR REPLACE FUNCTION public.find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid)
 RETURNS TABLE(driver_id uuid, full_name text, phone text, vehicle_id uuid, vehicle_plate text, rank_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     and v.verification_status = 'approved'          -- P0-3: a car KEKE approved
    join public.users u on u.id = v.driver_id
    where b.vt <> '' and b.vc <> ''
      and u.role = 'driver'
      and coalesce(u.is_verified, false) = true
      and coalesce(u.is_blocked, false) = false
      and u.id is distinct from p_exclude_driver_id
      -- P0-3: an approved, unblocked driver, and never one who declined this job
      and public.driver_account_approved(u.id)
      and not exists (
        select 1 from public.booking_driver_declines d
         where d.booking_id = p_booking_id
           and d.driver_id = u.id
      )
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
$function$;

revoke all on function public.find_replacement_driver_for_booking(uuid, uuid) from public;
grant execute on function public.find_replacement_driver_for_booking(uuid, uuid) to service_role;

-- 5. Direct API writes on bookings -------------------------------------------
--
-- Runs as the caller (no SECURITY DEFINER) so current_user tells an API
-- request ('authenticated' / 'anon') from the server's own functions, which
-- run as their owner and keep their own checks. Its name sorts before
-- bookings_stamp_lifecycle, so it sees the row exactly as the caller sent it.
create or replace function public.bookings_guard_direct_writes()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid;
  -- what the assigned driver's app writes during a trip
  trip_columns constant text[] := array[
    'status', 'updated_at',
    'odometer_start_photo_url', 'odometer_start_at',
    'odometer_end_photo_url', 'odometer_end_at',
    'payment_status', 'payment_confirmed_at', 'payment_confirmed_by',
    'driver_update_pending'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if current_user = 'anon' then
    raise exception 'bookings: sign in first' using errcode = '42501';
  end if;
  if public.is_admin_user() then
    return new;
  end if;
  uid := auth.uid();

  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'bookings: a new booking starts as pending; a driver takes it through accept_booking_atomic'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- The booking's company edits its booking (it sets the price), but puts a
  -- driver on it only through accept_booking_atomic. A convoy's coordinator
  -- row has no driver and mirrors its legs, so its status stays free.
  if uid is not null and uid = old.company_id then
    if new.is_group_master is distinct from old.is_group_master then
      raise exception 'bookings: is_group_master cannot be changed' using errcode = '42501';
    end if;
    if not coalesce(old.is_group_master, false) then
      if new.status is distinct from old.status
         and new.status in ('accepted', 'confirmed', 'in_progress', 'completed') then
        raise exception 'bookings: a driver takes a booking only through accept_booking_atomic'
          using errcode = '42501';
      end if;
      if new.driver_id is distinct from old.driver_id
         and old.status is distinct from 'pending' then
        raise exception 'bookings: the driver of a taken booking is not changed by a direct update'
          using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  -- Anyone else may only be the booking's own driver, working his trip.
  if uid is null or (uid is distinct from old.driver_id and uid is distinct from old.host_driver_id) then
    raise exception 'bookings: not your booking' using errcode = '42501';
  end if;
  if old.status is not distinct from 'pending' then
    raise exception 'bookings: a pending booking is accepted or declined only through the server functions'
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - trip_columns) is distinct from (to_jsonb(old) - trip_columns) then
    raise exception 'bookings: a driver can change only his trip''s progress (status, odometer, payment received)'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
       (old.status in ('accepted', 'confirmed') and new.status = 'in_progress')
    or (old.status = 'in_progress' and new.status = 'completed')
    or (old.status in ('accepted', 'confirmed', 'in_progress') and new.status = 'cancelled')) then
    raise exception 'bookings: a driver cannot move a booking from % to %', old.status, new.status
      using errcode = '42501';
  end if;
  if (new.payment_status, new.payment_confirmed_at, new.payment_confirmed_by)
       is distinct from (old.payment_status, old.payment_confirmed_at, old.payment_confirmed_by)
     and new.status is distinct from 'completed' then
    raise exception 'bookings: payment is confirmed on a completed trip' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.bookings_guard_direct_writes() from public, anon, authenticated;

drop trigger if exists bookings_guard_direct_writes on public.bookings;
create trigger bookings_guard_direct_writes
  before insert or update on public.bookings
  for each row execute function public.bookings_guard_direct_writes();

-- 6. Read and write rules on bookings ----------------------------------------

-- The direct-accept route goes; accept_booking_atomic is the only way in.
drop policy if exists bookings_update_driver_accept on public.bookings;

-- A pending booking — open, or offered to one driver — is readable only by
-- drivers who may take it. "Drivers see assigned bookings" (driver_id = me,
-- any status) is folded into the rule below with that condition.
drop policy if exists "Drivers see assigned bookings" on public.bookings;
drop policy if exists bookings_select_participants on public.bookings;
create policy bookings_select_participants on public.bookings
  as permissive for select to authenticated
  using (
    (company_id)::text = (auth.uid())::text
    or (
      ((driver_id)::text = (auth.uid())::text or host_driver_id = auth.uid())
      and (status is distinct from 'pending' or (select public.current_driver_can_take_jobs()))
    )
    or (
      (select public.current_driver_can_take_jobs())
      and status = 'pending'
      and coalesce(is_group_master, false) = false
      and (driver_id is null or trim(both from coalesce((driver_id)::text, '')) = '')
      and not exists (
        select 1 from public.booking_driver_declines d
         where d.booking_id = bookings.id
           and d.driver_id = auth.uid()
      )
    )
  );

-- 7. users: only an admin lifts or sets a block (production guard + is_blocked)

CREATE OR REPLACE FUNCTION public.guard_users_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      RAISE EXCEPTION 'privileged column: cannot set role to admin'
        USING ERRCODE = '42501';
    END IF;
    IF COALESCE(NEW.is_verified, false) THEN
      NEW.is_verified := false;
    END IF;
    -- A row cannot be born approved.
    IF lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('', 'pending', 'submitted') THEN
      NEW.verification_status := 'pending';
    END IF;
    -- Nor certified.
    NEW.keke_certified_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'privileged column: is_verified cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    -- verification_status decides who gets into the app, so only an admin may
    -- write a verdict into it. The owner may still move their own row between
    -- 'pending' and 'submitted', which is what uploading documents does.
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('pending', 'submitted')
    THEN
      RAISE EXCEPTION 'privileged column: verification_status cannot be set to %', NEW.verification_status
        USING ERRCODE = '42501';
    END IF;

    -- P0-3: a block is KEKE's decision; a blocked account cannot lift it.
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
      RAISE EXCEPTION 'privileged column: is_blocked cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.keke_certified_at IS DISTINCT FROM OLD.keke_certified_at THEN
      RAISE EXCEPTION 'privileged column: keke_certified_at cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF OLD.role IS NULL
         AND NEW.role IN ('driver', 'company')
         AND NEW.id = auth.uid()
      THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'privileged column: role cannot be changed'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

revoke all on function public.guard_users_privileged_columns() from public;
grant execute on function public.guard_users_privileged_columns() to service_role;

-- 8. vehicles: only an admin approves a car ----------------------------------
--
-- Same shape as the users guard: the owner may move his car between 'pending'
-- and 'submitted' (that is what re-sending documents does) and may switch it
-- on or off; a verdict and the verified flag are an admin's. A new car cannot
-- be born approved. Sorts before vehicles_activate_on_approval.
create or replace function public.guard_vehicles_verification_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if public.is_admin_user() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_verified := false;
    if lower(btrim(coalesce(new.verification_status, ''))) not in ('', 'pending', 'submitted') then
      new.verification_status := 'pending';
    end if;
    return new;
  end if;
  if new.is_verified is distinct from old.is_verified and coalesce(new.is_verified, false) then
    raise exception 'privileged column: only KEKE verifies a vehicle' using errcode = '42501';
  end if;
  if new.verification_status is distinct from old.verification_status
     and lower(btrim(coalesce(new.verification_status, ''))) not in ('pending', 'submitted') then
    raise exception 'privileged column: verification_status cannot be set to %', new.verification_status
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_vehicles_verification_columns() from public, anon, authenticated;
grant execute on function public.guard_vehicles_verification_columns() to service_role;

drop trigger if exists guard_vehicles_verification_columns on public.vehicles;
create trigger guard_vehicles_verification_columns
  before insert or update on public.vehicles
  for each row execute function public.guard_vehicles_verification_columns();

-- 9. Pickup-sign files -------------------------------------------------------
--
-- The bucket stays public, so the links stored on bookings keep opening as
-- before. What goes is the rule that let anyone list and fetch every file
-- through the API: now the company (its own folder), the booking's assigned
-- driver and admins.
drop policy if exists pickup_signs_public_read on storage.objects;
drop policy if exists pickup_signs_select_participants on storage.objects;
create policy pickup_signs_select_participants on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'booking-pickup-signs'
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or public.is_admin_user()
      or exists (
        select 1 from public.bookings b
         where (b.id)::text = (storage.foldername(objects.name))[2]
           and (b.driver_id = auth.uid() or b.host_driver_id = auth.uid())
           and b.status is distinct from 'pending'
      )
    )
  );

comment on function public.driver_open_jobs(uuid) is
  'P0-3: open jobs and offers for the signed-in driver, as safe summaries (no passenger, contact, sign, notes or company-internal prices). Empty unless driver_can_take_jobs().';
comment on function public.driver_can_take_jobs(uuid) is
  'P0-3: driver role, not blocked, verified, with an approved car that is active (or the approved car of an accepted fleet link).';

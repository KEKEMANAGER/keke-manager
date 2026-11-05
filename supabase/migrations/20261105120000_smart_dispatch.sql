-- Smart matching for new bookings (approved by the founder, 5 Nov 2026).
--
-- Before (production today):
--   * booking_dispatch_candidates() offered an ECONOMY job to comfort,
--     business and VIP cars from the very first push (any class ranked at or
--     above the job's), while the app's open-jobs list showed a job only for
--     the exact class. So those drivers were pushed a job they could not find:
--     on 5 Nov an economy 3-5 seat minivan tour (English, 5 passengers)
--     reached three drivers, and two of them (a comfort and a VIP car) could
--     not see it. 47 of the 60 drivers who may take jobs have only comfort or
--     VIP cars.
--   * A requested seat tier matched that tier only, and a job asking for a
--     language reached only drivers who list it (132 of 176 list none).
--   * Two waves: drivers working where the job starts now, the rest three
--     minutes later. Nothing wider after that.
--   * alert_undispatched_bookings() told the admin once, five minutes after
--     the booking was CREATED, and only for bookings created in the last 24
--     hours: a booking put back up later never alerted.
--   * The push carried date_display as stored ("2026-11-06T06:00:00.000Z")
--     instead of the time in Tbilisi (10:00).
--
-- After:
--   1. Category: the exact vehicle type, as before.
--   2. Seats: the requested tier first; the widening wave adds the bigger
--      tiers of the same type that still seat the passengers (a minivan_6_8
--      for a minivan_3_5 job). No tier requested: as before.
--   3. Class: an economy job goes to economy cars; comfort cars only in the
--      widening wave; VIP (and business, the same class in the app) never.
--      Comfort and VIP jobs: as before (that class or higher).
--   4. Languages: a driver who lists one of the job's languages; the widening
--      wave adds drivers who list no language at all (not those whose
--      languages leave it out).
--   5. As before: the driver's and the car's calendar, who may take jobs
--      (P0-3), declines (P0-1), hired drivers, the driver category asked for,
--      convoy coordinators.
--   6. Waves, counted from each launch (the first wave of a new booking, or
--      of one put back up): 1 now, exact matches working where the job
--      starts; 2 at +3 min, the other exact matches; 3 at +10 min, the
--      widened set, only drivers not told yet. If no driver has the job 20
--      minutes after its latest launch, the admin is alerted, once per launch.
--   7. driver_matching_open_jobs(): the open jobs the signed-in driver may
--      see now, decided by the same function as the pushes (exact matches,
--      and widened ones once that job's third wave went out), plus the jobs
--      offered to him by name. The app's open-jobs list reads it.
--   8. The push shows the start in Tbilisi time: "6 ნოემბერი, 10:00".
--
-- Changes no existing row. Adds three columns to bookings (the server's: the
-- P0-6 guard refuses a company's direct write to them, as it does for
-- dispatch_wave2_due_at) and two to dispatch_log. Every signature callers use
-- stays: booking_dispatch_candidates(uuid) is the exact set,
-- dispatch_new_booking_push(uuid, integer) also takes wave 3, and the cron
-- jobs call the same functions (the third wave rides on the every-minute
-- second-wave job, the alert on "alert-undispatched").
--
-- Undo: supabase/rollback/20261105120000_smart_dispatch_undo.sql
-- Tests: supabase/tests/run_smart_dispatch_tests.sh (see supabase/tests/README.md)

-- 0. Preflight: stop, changing nothing, if what this builds on is missing or
--    a definition it replaces is not the one it was written against
--    (fingerprints of the body with CRs removed) - unless it is already this
--    migration's own, so a second run is harmless.
do $$
declare
  expected constant jsonb := jsonb_build_object(
    'booking_dispatch_candidates(uuid)',        jsonb_build_array('7bb06d17d6b8afd4ccff7288681f4b37', 'b9d8c1960653ed1c46029a952db40672'),
    'booking_dispatch_message(uuid)',           jsonb_build_array('dbc8c06cd4fd69dd8e2f9a5d6a73533b', 'da54840428afdcce7bec30d2e27545e0'),
    'dispatch_new_booking_push(uuid,integer)',  jsonb_build_array('d15b7f374e7a6327f68c4fa3cfe40f2b', '0b9acc76701b7828c28ec493573c522d'),
    'dispatch_new_booking(uuid,uuid[],uuid[])', jsonb_build_array('e0dccd9abab51e775d34cebde8703e06', 'f04b21bd943fd54da458fe5ad70cdb04'),
    'dispatch_due_second_waves()',              jsonb_build_array('86d752ac81aac0e0aa13458b94aff48b', '6548a89985f4e889507ba12579a92f3c'),
    'alert_undispatched_bookings()',            jsonb_build_array('943fccc6858ca06edb4784b8ade90a36', '0b684932051f1d31d7a9f004305bec0e'),
    'bookings_guard_ownership()',               jsonb_build_array('1694bef7bfea20efebd27ddeae42eafa', 'f87a9e3d3ba070f93ad44f53f2fcd1a4'));
  k   text;
  got text;
begin
  if to_regclass('public.booking_driver_declines') is null
     or to_regclass('public.push_tokens') is null
     or to_regprocedure('public.driver_can_take_jobs(uuid)') is null
     or to_regprocedure('public.booking_open_job_summary(public.bookings)') is null then
    raise exception 'smart dispatch stopped: P0-1, P0-3 part A, P0-4 part A and P0-6 must be applied first';
  end if;
  for k in select jsonb_object_keys(expected) loop
    select md5(replace(p.prosrc, E'\r', '')) into got
      from pg_proc p
     where p.oid = to_regprocedure('public.' || k);
    if got is null or not ((expected -> k) ? got) then
      raise exception 'smart dispatch stopped: public.% is not the version this migration was written against (found %)',
        k, coalesce(got, 'nothing');
    end if;
  end loop;
end
$$;

-- 1. Where a booking is in its waves -------------------------------------------

alter table public.bookings add column if not exists dispatch_launched_at   timestamptz;
alter table public.bookings add column if not exists dispatch_wave3_due_at  timestamptz;
alter table public.bookings add column if not exists dispatch_wave3_sent_at timestamptz;

comment on column public.bookings.dispatch_launched_at is
  'Smart dispatch: when the latest launch of this booking went out (the first wave of a new booking, or of one put back up). The widening wave and the admin alert count from it.';
comment on column public.bookings.dispatch_wave3_due_at is
  'Smart dispatch: when the widening (third) wave of the latest launch is due, ten minutes after it; cleared once it has run. Open jobs only.';
comment on column public.bookings.dispatch_wave3_sent_at is
  'Smart dispatch: when the widening wave of the latest launch went out. Until then only exact matches see the job in the app; a new launch clears it.';

alter table public.dispatch_log add column if not exists wave3_driver_ids  uuid[]  not null default '{}'::uuid[];
alter table public.dispatch_log add column if not exists wave3_token_count integer not null default 0;

comment on column public.dispatch_log.wave3_driver_ids is
  'Smart dispatch: the drivers the widening (third) wave told.';
comment on column public.dispatch_log.wave3_token_count is
  'Smart dispatch: how many of them had a phone to push to.';

-- 2. Those columns are the server's ----------------------------------------------
--
-- The P0-6 guard, with the three new columns among the ones a company's
-- direct write may not set or change (a company could otherwise move its
-- job to the widening wave early, or keep it from the admin's alert).

create or replace function public.bookings_guard_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid;
  n jsonb;
  o jsonb;
  bad text;
  -- written by the server's functions and jobs, by the driver's trip (P0-3)
  -- or by an admin - never by a company's direct write
  server_columns constant text[] := array[
    'reminder_24h_sent', 'reminder_1h_sent', 'reminder_1h_sent_at',
    'reminder_3h_sent', 'reminder_3h_sent_at', 'reminder_45m_sent', 'reminder_45m_sent_at',
    'driver_confirmed_1h', 'driver_confirmed_at', 'company_unconfirmed_alert_sent',
    'reassign_count', 'auto_reassigned_at', 'completed_at', 'cancelled_by', 'cancelled_at',
    'dispatch_fallback_sent_at', 'dispatch_wave2_due_at', 'dispatch_alert_sent_at',
    'dispatch_launched_at', 'dispatch_wave3_due_at', 'dispatch_wave3_sent_at',
    'odometer_start_photo_url', 'odometer_start_at', 'odometer_end_photo_url', 'odometer_end_at',
    'payment_status', 'payment_confirmed_at', 'payment_confirmed_by',
    'breakdown_location', 'breakdown_location_type', 'host_driver_id'];
  identity_columns constant text[] := array['id', 'company_id', 'created_at'];
  convoy_columns constant text[] := array['is_group_master', 'parent_booking_id', 'leg_index', 'group_code'];
  driver_columns constant text[] := array[
    'driver_id', 'vehicle_id', 'driver_display_name', 'driver_phone', 'driver_plate', 'is_emergency_replacement'];
  money_columns constant text[] := array[
    'price_gel', 'price_net', 'price_gross', 'client_price', 'commission',
    'driver_payout_gel', 'payment_method', 'price_includes_fuel'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;   -- the server's own functions and jobs
  end if;
  if public.is_admin_user() then
    return new;
  end if;
  uid := auth.uid();
  n := to_jsonb(new);

  if tg_op = 'INSERT' then
    select string_agg(e.key, ', ' order by e.key) into bad
      from jsonb_each(n) e
     where e.key = any (server_columns)
       and e.value not in ('null'::jsonb, 'false'::jsonb)
       and not (e.key = 'reassign_count' and e.value = '0'::jsonb)
       and not (e.key = 'payment_status' and e.value = '"unpaid"'::jsonb);
    if bad is not null then
      raise exception 'bookings: a new booking cannot set % (the server does)', bad using errcode = '42501';
    end if;
    -- (the review-debt gate lets emergency replacements through, so a new
    -- booking cannot simply claim to be one)
    if coalesce(new.is_emergency_replacement, false) then
      raise exception 'bookings: only a replacement on an existing booking is an emergency replacement' using errcode = '42501';
    end if;
    if coalesce(new.is_group_master, false) and new.parent_booking_id is not null then
      raise exception 'bookings: a convoy coordinator cannot be a car of another convoy' using errcode = '42501';
    end if;
    if new.parent_booking_id is not null
       and not public.booking_convoy_open_for(new.parent_booking_id, new.company_id) then
      raise exception 'bookings: a convoy car is added only to an open convoy of the same company' using errcode = '42501';
    end if;
    if new.driver_id is not null then
      if not public.booking_driver_assignable(new.driver_id, new.vehicle_id) then
        raise exception 'bookings: this driver cannot be given jobs (not approved by KEKE, or the vehicle is not his approved one)'
          using errcode = '42501';
      end if;
    elsif new.vehicle_id is not null or new.driver_display_name is not null
       or new.driver_phone is not null or new.driver_plate is not null then
      raise exception 'bookings: driver details come only with a driver' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. A driver (or a fleet host) is kept to his trip by
  -- bookings_guard_direct_writes; here the booking's company.
  if uid is null or uid is distinct from old.company_id then
    return new;
  end if;
  o := to_jsonb(old);

  select string_agg(c, ', ') into bad from unnest(identity_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    raise exception 'bookings: % of a booking never changes', bad using errcode = '42501';
  end if;

  select string_agg(c, ', ') into bad from unnest(convoy_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    raise exception 'bookings: a convoy is fixed when it is created (%)', bad using errcode = '42501';
  end if;

  select string_agg(c, ', ') into bad from unnest(server_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    raise exception 'bookings: % is written by the server only', bad using errcode = '42501';
  end if;

  if exists (select 1 from unnest(driver_columns) c where n -> c is distinct from o -> c) then
    if old.status is distinct from 'pending' then
      raise exception 'bookings: the driver of a taken booking is changed only by the server' using errcode = '42501';
    end if;
    if new.driver_id is not null then
      if not public.booking_driver_assignable(new.driver_id, new.vehicle_id) then
        raise exception 'bookings: this driver cannot be given jobs (not approved by KEKE, or the vehicle is not his approved one)'
          using errcode = '42501';
      end if;
    elsif new.vehicle_id is not null or new.driver_display_name is not null
       or new.driver_phone is not null or new.driver_plate is not null then
      raise exception 'bookings: driver details come only with a driver' using errcode = '42501';
    end if;
  end if;

  select string_agg(c, ', ') into bad from unnest(money_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    if old.status in ('completed', 'cancelled', 'rejected') then
      raise exception 'bookings: the money of a % booking is final (%)', old.status, bad using errcode = '42501';
    end if;
    if n -> 'driver_payout_gel' is distinct from o -> 'driver_payout_gel' and old.status is distinct from 'pending' then
      raise exception 'bookings: the driver''s pay is set before a driver takes the job' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.bookings_guard_ownership() from public, anon, authenticated;

-- 3. Who may hear about a job, and see it --------------------------------------

-- Seats in a capacity tier (the larger number of lib/vehicleCatalog.ts
-- CAPACITY_TIER_SEATS). Null for anything else.
create or replace function public.capacity_tier_max_seats(p_tier text)
returns integer
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_tier, '')))
           when 'minivan_3_5' then 5
           when 'minivan_6_8' then 8
           when 'microbus_10' then 10
           when 'microbus_13' then 13
           when 'microbus_16' then 16
           when 'microbus_17' then 17
           when 'microbus_18' then 18
           when 'microbus_20' then 20
         end;
$$;

-- The one rule for who may hear about a job and see it (the pushes, every
-- wave, and the drivers' open-jobs list): booking_dispatch_candidates() as it
-- was (vehicle_calendar), with the job's own class, seats and languages
-- (exact) or, with p_widened, the widening wave's (rules 2-4 above).
-- p_driver_id: only that driver (the open-jobs list asks about one driver);
-- null: everyone. is_local: works where the job starts, or finishes a job
-- there shortly before (the first wave).
create or replace function public.booking_dispatch_pool(p_booking_id uuid, p_widened boolean, p_driver_id uuid)
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
  v_tier  text;
  v_seats int;
  v_wide  boolean := coalesce(p_widened, false);
begin
  select * into b from public.bookings x where x.id = p_booking_id;
  if not found or b.status is distinct from 'pending' then
    return;
  end if;

  -- one driver: nothing to work out unless he has a car of that type at all
  if p_driver_id is not null and not exists (
       select 1
         from public.vehicles v
        where v.type = b.vehicle_type
          and (v.driver_id = p_driver_id
               or exists (select 1 from public.driver_fleet f
                           where f.vehicle_id = v.id
                             and f.sub_driver_id = p_driver_id
                             and f.status = 'accepted'))) then
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
  v_tier  := nullif(trim(coalesce(b.requested_capacity_tier, '')), '');
  v_seats := public.capacity_tier_max_seats(v_tier);

  return query
    with matching_vehicles as (
      select v.id, v.driver_id
        from public.vehicles v
       where v.is_active = true
         and v.is_verified = true
         and v.verification_status = 'approved'
         and v.type = b.vehicle_type
         -- class
         and (
           v_class is null
           or v.class = v_class
           -- an economy job: economy cars; comfort ones only when widened;
           -- never business or VIP
           or (
             v_rank = 1
             and (public.vehicle_class_rank(v.class) = 1
                  or (v_wide and public.vehicle_class_rank(v.class) = 2))
           )
           -- a comfort or VIP job: that class or higher, as before
           or (
             v_rank > 1
             and public.vehicle_class_rank(v.class) is not null
             and public.vehicle_class_rank(v.class) >= v_rank
           )
         )
         -- seats: the tier asked for; when widened, a bigger tier of the same
         -- type that still seats the passengers
         and (
           v_tier is null
           or v.capacity_tier = b.requested_capacity_tier
           or (
             v_wide
             and v_seats is not null
             and split_part(v.capacity_tier, '_', 1) = split_part(v_tier, '_', 1)
             and public.capacity_tier_max_seats(v.capacity_tier) > v_seats
             and (b.passengers is null or public.capacity_tier_max_seats(v.capacity_tier) >= b.passengers)
           )
         )
         -- a car its host marked unavailable for the job's days is not offered
         and (w_start is null or w_end is null or not exists (
               select 1 from public.driver_schedules vb
                where vb.source = 'vehicle'
                  and vb.vehicle_id = v.id
                  and vb.start_time < w_end
                  and vb.end_time   > w_start))
         -- one driver: his own cars and the ones his fleet owner gave him
         and (p_driver_id is null
              or v.driver_id = p_driver_id
              or exists (select 1 from public.driver_fleet f
                          where f.vehicle_id = v.id
                            and f.sub_driver_id = p_driver_id
                            and f.status = 'accepted'))
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
     where (p_driver_id is null or c.id = p_driver_id)
       and (b.driver_id is null or c.id = b.driver_id)
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
       -- languages: one of the job's; when widened, also a driver who lists
       -- none at all
       and (
         b.required_languages is null
         or array_length(b.required_languages, 1) is null
         or coalesce(u.languages, p.languages, array[]::text[]) && b.required_languages
         or (
           v_wide
           and not exists (
             select 1
               from unnest(coalesce(u.languages, p.languages, array[]::text[])) l(code)
              where btrim(coalesce(l.code, '')) <> '')
         )
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

-- Every caller of the one-argument form (the app's ordered waves through
-- dispatch_new_booking, the installed apps' second wave, the outbox flush)
-- gets the exact matches, as the first two waves do.
create or replace function public.booking_dispatch_candidates(p_booking_id uuid)
returns table (candidate_id uuid, is_local boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.candidate_id, c.is_local
    from public.booking_dispatch_pool(p_booking_id, false, null) c;
$$;

-- 4. The push text: the start in Tbilisi time ----------------------------------

-- "6 ნოემბერი, 10:00" for a start the app stored as an instant
-- ("2026-11-06T06:00:00.000Z"); a date-time without a zone is already Tbilisi
-- time, a bare date gives "6 ნოემბერი". Anything else comes back as it was
-- written; nothing gives null.
create or replace function public.booking_start_label_ka(p_date_display text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  raw    text := btrim(coalesce(p_date_display, ''));
  ts     timestamp;
  months constant text[] := array[
    'იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი',
    'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
begin
  if raw = '' then
    return null;
  end if;
  begin
    if raw ~ '^\d{4}-\d{2}-\d{2}$' then
      ts := raw::date;
      return extract(day from ts)::int || ' ' || months[extract(month from ts)::int];
    elsif raw ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}(:?\d{2})?)$' then
      ts := raw::timestamptz at time zone 'Asia/Tbilisi';
    elsif raw ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$' then
      ts := raw::timestamp;
    else
      return raw;
    end if;
  exception when others then
    return raw;
  end;
  return extract(day from ts)::int || ' ' || months[extract(month from ts)::int] || ', ' || to_char(ts, 'HH24:MI');
end;
$$;

-- The new-booking text: as before, with the start in Tbilisi time.
create or replace function public.booking_dispatch_message(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b      public.bookings;
  v_kind text;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return null;
  end if;
  v_kind := lower(coalesce(nullif(trim(b.kind), ''), nullif(trim(b.booking_type), ''), 'transfer'));
  return jsonb_build_object(
    'title', case
               when v_kind in ('day_tour', 'daytour') then 'KEKE · ახალი დღის ტური!'
               when v_kind = 'tour' then 'KEKE · ახალი ტური!'
               else 'KEKE · ახალი ტრანსფერი!'
             end,
    'body', public.booking_route_summary(b.from_location, b.to_location, b.route::text)
            || coalesce(' · ' || public.booking_start_label_ka(b.date_display), ''),
    'data', jsonb_build_object(
              'type', 'new_booking',
              'booking_id', b.id::text,
              'booking_kind', case when v_kind in ('tour', 'day_tour') then v_kind else 'transfer' end,
              'vehicle_type', coalesce(b.vehicle_type, ''),
              'vehicle_class', coalesce(b.vehicle_class, '')));
end;
$$;

-- 5. The waves --------------------------------------------------------------------

-- A launch: the first wave of a new booking, or of one put back up. The
-- widening wave of an open job is due ten minutes on, its widened drivers
-- see the job only after it, and the admin alert counts from now.
create or replace function public.booking_dispatch_launch(p_booking_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings b
     set dispatch_launched_at   = now(),
         dispatch_wave3_due_at  = case when b.driver_id is null and not coalesce(b.is_group_master, false)
                                       then now() + interval '10 minutes' end,
         dispatch_wave3_sent_at = null
   where b.id = p_booking_id;
$$;

-- The server's dispatch (the one-minute fallback, the second and third waves,
-- and dispatch_new_booking without an order from the app): as before, with
-- wave 1 starting a launch and wave 3, the widened set, for drivers not told
-- yet.
CREATE OR REPLACE FUNCTION public.dispatch_new_booking_push(p_booking_id uuid, p_wave integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b          record;
  d          record;
  msg        jsonb;
  n          int := 0;
  deferred   int := 0;
  pushed     int := 0;
  v_city     text;
  v_wave     int := case when p_wave in (2, 3) then p_wave else 1 end;
  v_told     uuid[] := '{}';
begin
  -- P0-4: one dispatch of a booking at a time (the app, the one-minute
  -- fallback and the later waves can meet), so the "already told" check
  -- below always sees the other run's notifications and nobody is told twice.
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status <> 'pending' then
    return 0;
  end if;

  -- the third wave goes out once per launch, when it is due: a run that
  -- waited on a launch made meanwhile finds that launch's own, not yet due
  if v_wave = 3 and (b.dispatch_wave3_due_at is null or b.dispatch_wave3_due_at > now()) then
    return 0;
  end if;

  -- the first wave is a launch: the widening wave and the admin alert count from it
  if v_wave = 1 then
    perform public.booking_dispatch_launch(p_booking_id);
  end if;

  v_city := public.booking_start_city(p_booking_id);
  msg    := public.booking_dispatch_message(p_booking_id);

  for d in
    select c.candidate_id as id,
           c.is_local,
           public.fetch_user_push_token(c.candidate_id) is not null as has_push
      from public.booking_dispatch_pool(p_booking_id, v_wave = 3, null) c
     where not public.booking_driver_told(p_booking_id, c.candidate_id)
  loop
    if v_wave = 1 and not d.is_local then
      deferred := deferred + 1;
      continue;
    end if;
    perform public.booking_notify(d.id, msg ->> 'title', msg ->> 'body', 'new_booking', msg -> 'data');
    v_told := v_told || d.id;
    n := n + 1;
    if d.has_push then pushed := pushed + 1; end if;
  end loop;

  -- The admin panel reads this table. Without a row here a dispatch leaves no
  -- trace at all, which is how two bookings reached nobody unnoticed.
  if v_wave = 1 then
    -- P0-4: a repeat that found everyone told already adds no "reached
    -- nobody" row over the real one
    if n > 0 or deferred > 0
       or not exists (select 1 from public.dispatch_log x where x.booking_id = b.id) then
      insert into public.dispatch_log (
        booking_id, company_id, regions, from_location, to_location,
        wave1_driver_ids, wave1_token_count, wave1_sent
      ) values (
        b.id, b.company_id, case when v_city is null then '{}'::text[] else array[v_city] end,
        b.from_location, b.to_location, v_told, pushed, n
      );
    end if;
    update public.bookings
       set dispatch_wave2_due_at = case when deferred > 0 then now() + interval '3 minutes' end
     where id = p_booking_id;
  elsif v_wave = 2 then
    update public.dispatch_log
       set wave2_driver_ids = v_told, wave2_token_count = pushed
     where booking_id = b.id
       and id = (select id from public.dispatch_log where booking_id = b.id
                 order by created_at desc limit 1);
    update public.bookings set dispatch_wave2_due_at = null where id = p_booking_id;
  else
    -- added to, not overwritten: a later launch's third wave keeps the earlier one's
    update public.dispatch_log
       set wave3_driver_ids = wave3_driver_ids || v_told, wave3_token_count = wave3_token_count + pushed
     where booking_id = b.id
       and id = (select id from public.dispatch_log where booking_id = b.id
                 order by created_at desc limit 1);
    -- from now on the widened drivers see the job in the app too
    update public.bookings
       set dispatch_wave3_due_at = null, dispatch_wave3_sent_at = now()
     where id = p_booking_id;
  end if;

  return n;
end;
$function$;

-- The company has created a booking: tell the drivers (P0-4), and when the
-- app gives the order of the first two waves, that is the launch the
-- widening wave counts from.
create or replace function public.dispatch_new_booking(
  p_booking_id uuid, p_first uuid[] default null, p_later uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  b         public.bookings;
  msg       jsonb;
  c         record;
  now_ids   uuid[] := '{}';
  later_ids uuid[] := '{}';
  pushed    int := 0;
  first_run boolean;
  n         int;
  v_city    text;
begin
  if uid is null then
    raise exception 'dispatch_new_booking: sign in first' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('notified', 0, 'queued', 0);
  end if;
  if uid is distinct from b.company_id and not public.is_admin_user() then
    raise exception 'dispatch_new_booking: not your booking' using errcode = '42501';
  end if;
  if b.status is distinct from 'pending' or coalesce(b.is_group_master, false) then
    return jsonb_build_object('notified', 0, 'queued', 0, 'open', false);
  end if;
  first_run := b.dispatch_fallback_sent_at is null;

  if p_first is null and p_later is null then
    if not first_run
       or exists (select 1 from public.notifications x
                   where x.type = 'new_booking' and x.data ->> 'booking_id' = b.id::text) then
      return jsonb_build_object('notified', 0, 'queued', 0, 'already', true);
    end if;
    update public.bookings set dispatch_fallback_sent_at = now() where id = b.id;
    n := public.dispatch_new_booking_push(b.id, 1);
    return jsonb_build_object(
      'notified', n,
      'queued', 0,
      'waiting', (select x.dispatch_wave2_due_at is not null from public.bookings x where x.id = b.id));
  end if;

  msg := public.booking_dispatch_message(b.id);
  for c in
    select x.candidate_id as id,
           public.fetch_user_push_token(x.candidate_id) is not null as has_push
      from public.booking_dispatch_candidates(b.id) x
     where not public.booking_driver_told(b.id, x.candidate_id)
  loop
    if c.id = any (coalesce(p_first, '{}'::uuid[])) then
      perform public.booking_notify(c.id, msg ->> 'title', msg ->> 'body', 'new_booking', msg -> 'data');
      now_ids := now_ids || c.id;
      if c.has_push then pushed := pushed + 1; end if;
    elsif c.id = any (coalesce(p_later, '{}'::uuid[])) then
      insert into public.push_outbox (booking_id, user_id, token, title, body, data, send_after)
      values (b.id, c.id, '', msg ->> 'title', msg ->> 'body', msg -> 'data', now() + interval '3 minutes')
      on conflict (booking_id, user_id) where user_id is not null do nothing;
      if found then
        later_ids := later_ids || c.id;
      end if;
    end if;
  end loop;

  if first_run
     and cardinality(now_ids) + cardinality(later_ids) = 0
     and not exists (select 1 from public.notifications x
                      where x.type = 'new_booking' and x.data ->> 'booking_id' = b.id::text) then
    -- none of the drivers the app put forward may be told: the server's own
    -- waves, as the one-minute fallback would have run them
    update public.bookings set dispatch_fallback_sent_at = now() where id = b.id;
    n := public.dispatch_new_booking_push(b.id, 1);
    return jsonb_build_object('notified', n, 'queued', 0, 'server_waves', true);
  end if;

  update public.bookings
     set dispatch_fallback_sent_at = coalesce(dispatch_fallback_sent_at, now())
   where id = b.id;

  -- the app's order is this booking's launch: the widening wave is due in ten minutes
  if first_run then
    perform public.booking_dispatch_launch(b.id);
  end if;

  if first_run or cardinality(now_ids) + cardinality(later_ids) > 0 then
    v_city := public.booking_start_city(b.id);
    insert into public.dispatch_log (
      booking_id, company_id, regions, from_location, to_location,
      wave1_driver_ids, wave2_driver_ids, wave1_token_count, wave2_token_count, wave1_sent
    ) values (
      b.id, b.company_id, case when v_city is null then '{}'::text[] else array[v_city] end,
      b.from_location, b.to_location, now_ids, later_ids, pushed, cardinality(later_ids), cardinality(now_ids)
    );
  end if;

  return jsonb_build_object('notified', cardinality(now_ids), 'queued', cardinality(later_ids));
end;
$$;

-- The widening wave of every open job whose launch was ten minutes ago. Run
-- every minute by dispatch_due_second_waves() below. The wave itself marks
-- it done (sent, no longer due), under the booking's lock: a launch that
-- comes in meanwhile keeps its own third wave.
create or replace function public.dispatch_due_third_waves()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  total int := 0;
begin
  for r in
    select b.id
      from public.bookings b
     where b.status = 'pending'
       and b.driver_id is null
       and coalesce(b.is_group_master, false) = false
       and b.dispatch_wave3_due_at is not null
       and b.dispatch_wave3_due_at <= now()
     order by b.dispatch_wave3_due_at
     limit 20
  loop
    total := total + public.dispatch_new_booking_push(r.id, 3);
  end loop;
  return total;
end;
$$;

-- Every minute (the production cron job that runs the second waves): the
-- second waves that are due, as before, then the third ones. A failure in
-- the third waves is reported and does not undo the second ones.
CREATE OR REPLACE FUNCTION public.dispatch_due_second_waves()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     record;
  total int := 0;
begin
  for r in
    select b.id
      from public.bookings b
     where b.status = 'pending'
       and b.driver_id is null
       and b.dispatch_wave2_due_at is not null
       and b.dispatch_wave2_due_at <= now()
     order by b.dispatch_wave2_due_at
     limit 20
  loop
    total := total + public.dispatch_new_booking_push(r.id, 2);
    update public.bookings set dispatch_wave2_due_at = null where id = r.id;
  end loop;

  begin
    total := total + public.dispatch_due_third_waves();
  exception when others then
    raise warning 'dispatch_due_third_waves failed: % %', sqlstate, sqlerrm;
  end;

  return total;
end;
$function$;

-- 6. The admin alert: 20 minutes after the latest launch, once per launch -----
--
-- A launch is the latest of: the booking's creation, its first dispatch
-- (dispatch_fallback_sent_at, which is also what putting a booking back up
-- set so far) and the first wave of its latest launch (dispatch_launched_at).
-- Launches older than a day are left alone, as before, so switching this on
-- does not flood the admin with old bookings.
create or replace function public.alert_undispatched_bookings()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       record;
  a       record;
  total   int := 0;
  v_title text;
  v_body  text;
begin
  for r in
    select b.id, b.voucher_code, b.from_location, b.to_location, b.route,
           (select count(distinct n.user_id)
              from public.notifications n
             where n.type = 'new_booking'
               and (n.data ->> 'booking_id') = b.id::text) as reached
      from public.bookings b
      cross join lateral (
        select greatest(b.created_at, b.dispatch_fallback_sent_at, b.dispatch_launched_at) as at
      ) l
     where b.status = 'pending'
       and b.driver_id is null
       and l.at <= now() - interval '20 minutes'
       and l.at >  now() - interval '24 hours'
       and (b.dispatch_alert_sent_at is null or b.dispatch_alert_sent_at < l.at)
     order by l.at
     limit 10
  loop
    if r.reached = 0 then
      v_title := 'KEKE · ჯავშანი არავის მივიდა!';
      v_body  := coalesce(nullif(trim(r.voucher_code), ''), '') || ' · '
                 || public.booking_route_summary(r.from_location, r.to_location, r.route::text)
                 || ' · არცერთ მძღოლს არ მისულა';
    else
      v_title := 'KEKE · ჯავშანი არავინ აიღო!';
      v_body  := coalesce(nullif(trim(r.voucher_code), ''), '') || ' · '
                 || public.booking_route_summary(r.from_location, r.to_location, r.route::text)
                 || ' · ' || r.reached || ' მძღოლს მიუვიდა, 20 წუთში არავინ აიღო';
    end if;

    for a in select id from public.users where role = 'admin'
    loop
      perform public.booking_notify(
        a.id,
        v_title,
        v_body,
        'dispatch_alert',
        jsonb_build_object('type', 'dispatch_alert', 'booking_id', r.id::text,
                           'reached', r.reached)
      );
    end loop;

    update public.bookings set dispatch_alert_sent_at = now() where id = r.id;
    total := total + 1;
  end loop;

  return total;
end;
$function$;

-- 7. The open jobs a driver may see now ------------------------------------------

-- The signed-in driver's open-jobs list, as summaries (no passenger details:
-- booking_open_job_summary, as driver_open_jobs). A job open to everyone is
-- in it when booking_dispatch_pool() lets him hear about it now: an exact
-- match, or a widened one once that job's third wave went out. A job offered
-- to him by name is always in it. Empty for anyone driver_can_take_jobs()
-- refuses. One job: p_booking_id.
create or replace function public.driver_matching_open_jobs(p_booking_id uuid default null)
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
           and exists (
             select 1
               from public.booking_dispatch_pool(b.id, b.dispatch_wave3_sent_at is not null, me) m
           )
         )
       )
  ), '[]'::jsonb);
end;
$$;

-- 8. Rights: as before for what existed; the server's helpers are the server's,
--    the open-jobs list is for signed-in users ----------------------------------

revoke all on function public.capacity_tier_max_seats(text) from public, anon, authenticated;
revoke all on function public.booking_dispatch_pool(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.booking_dispatch_candidates(uuid) from public, anon, authenticated;
revoke all on function public.booking_start_label_ka(text) from public, anon, authenticated;
revoke all on function public.booking_dispatch_message(uuid) from public, anon, authenticated;
revoke all on function public.booking_dispatch_launch(uuid) from public, anon, authenticated;
revoke all on function public.dispatch_new_booking_push(uuid, integer) from public, anon, authenticated;
revoke all on function public.dispatch_due_third_waves() from public, anon, authenticated;
revoke all on function public.dispatch_due_second_waves() from public, anon, authenticated;
revoke all on function public.alert_undispatched_bookings() from public, anon, authenticated;
revoke all on function public.dispatch_new_booking(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.driver_matching_open_jobs(uuid) from public, anon;

grant execute on function public.capacity_tier_max_seats(text) to service_role;
grant execute on function public.booking_dispatch_pool(uuid, boolean, uuid) to service_role;
grant execute on function public.booking_dispatch_candidates(uuid) to service_role;
grant execute on function public.booking_start_label_ka(text) to service_role;
grant execute on function public.booking_dispatch_message(uuid) to service_role;
grant execute on function public.booking_dispatch_launch(uuid) to service_role;
grant execute on function public.dispatch_new_booking_push(uuid, integer) to service_role;
grant execute on function public.dispatch_due_third_waves() to service_role;
grant execute on function public.dispatch_due_second_waves() to service_role;
grant execute on function public.alert_undispatched_bookings() to service_role;
grant execute on function public.dispatch_new_booking(uuid, uuid[], uuid[]) to authenticated, service_role;
grant execute on function public.driver_matching_open_jobs(uuid) to authenticated, service_role;

comment on function public.booking_dispatch_pool(uuid, boolean, uuid) is
  'Smart dispatch: who may hear about a pending booking (and see it in the open-jobs list). Exact: the booking''s type, class (economy: economy only; comfort/VIP: that class or higher), seat tier and languages; widened (p_widened): also comfort cars for an economy job, bigger seat tiers that still seat the passengers, drivers who list no language. p_driver_id limits it to one driver.';
comment on function public.booking_dispatch_candidates(uuid) is
  'P0-4 / smart dispatch: the exact matches for a booking (booking_dispatch_pool without widening): waves 1 and 2, the app''s ordered waves, the outbox flush.';
comment on function public.dispatch_due_third_waves() is
  'Smart dispatch: the widening (third) wave of open jobs launched ten minutes ago, to drivers not told yet. Run every minute through dispatch_due_second_waves().';
comment on function public.driver_matching_open_jobs(uuid) is
  'Smart dispatch: the open jobs the signed-in driver may see now (exact matches, widened ones once the job''s third wave went out, and jobs offered to him by name), as summaries.';
comment on function public.booking_start_label_ka(text) is
  'Smart dispatch: a booking''s start for the push, in Tbilisi time ("6 ნოემბერი, 10:00"); text it cannot read is returned as written.';

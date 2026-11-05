-- Undo 20261105120000_smart_dispatch.sql.
--
-- Puts back, exactly as they were, the seven functions the migration
-- replaced (booking_dispatch_candidates, booking_dispatch_message,
-- dispatch_new_booking_push, dispatch_new_booking, dispatch_due_second_waves,
-- alert_undispatched_bookings, bookings_guard_ownership) with their rights,
-- then drops what it added: driver_matching_open_jobs and its helpers, and
-- the columns bookings.dispatch_launched_at / dispatch_wave3_due_at /
-- dispatch_wave3_sent_at and dispatch_log.wave3_driver_ids /
-- wave3_token_count (dispatch bookkeeping only; no booking, driver or
-- notification is touched). Third waves that were due simply do not run.
--
-- Run it as one transaction (psql -1, or the release tooling's own). It can
-- be run again. An app that already reads driver_matching_open_jobs falls
-- back to its own filter when the function is gone.

-- booking_dispatch_candidates as it was (supabase/migrations/20261103130000_vehicle_calendar.sql)
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

revoke all on function public.booking_dispatch_candidates(uuid) from public, anon, authenticated;
grant execute on function public.booking_dispatch_candidates(uuid) to service_role;

-- booking_dispatch_message as it was (supabase/migrations/20261101090000_push_tokens_server_delivery.sql)
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
            || coalesce(' · ' || nullif(trim(b.date_display), ''), ''),
    'data', jsonb_build_object(
              'type', 'new_booking',
              'booking_id', b.id::text,
              'booking_kind', case when v_kind in ('tour', 'day_tour') then v_kind else 'transfer' end,
              'vehicle_type', coalesce(b.vehicle_type, ''),
              'vehicle_class', coalesce(b.vehicle_class, '')));
end;
$$;

revoke all on function public.booking_dispatch_message(uuid) from public, anon, authenticated;
grant execute on function public.booking_dispatch_message(uuid) to service_role;

-- dispatch_new_booking_push(uuid, integer) as it was (supabase/migrations/20261101090000_push_tokens_server_delivery.sql)
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
  v_wave     int := case when p_wave = 2 then 2 else 1 end;
  v_told     uuid[] := '{}';
begin
  -- P0-4: one dispatch of a booking at a time (the app, the one-minute
  -- fallback and the second wave can meet), so the "already told" check
  -- below always sees the other run's notifications and nobody is told twice.
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status <> 'pending' then
    return 0;
  end if;

  v_city := public.booking_start_city(p_booking_id);
  msg    := public.booking_dispatch_message(p_booking_id);

  for d in
    select c.candidate_id as id,
           c.is_local,
           public.fetch_user_push_token(c.candidate_id) is not null as has_push
      from public.booking_dispatch_candidates(p_booking_id) c
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
  else
    update public.dispatch_log
       set wave2_driver_ids = v_told, wave2_token_count = pushed
     where booking_id = b.id
       and id = (select id from public.dispatch_log where booking_id = b.id
                 order by created_at desc limit 1);
    update public.bookings set dispatch_wave2_due_at = null where id = p_booking_id;
  end if;

  return n;
end;
$function$;

revoke all on function public.dispatch_new_booking_push(uuid, integer) from public, anon, authenticated;
grant execute on function public.dispatch_new_booking_push(uuid, integer) to service_role;

-- dispatch_new_booking as it was (supabase/migrations/20261101090000_push_tokens_server_delivery.sql)
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

revoke all on function public.dispatch_new_booking(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.dispatch_new_booking(uuid, uuid[], uuid[]) to authenticated, service_role;

-- dispatch_due_second_waves as it is in production (supabase/tests/fixtures/prod_p0_4_snapshot_2026-10-31.sql)
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
  return total;
end;
$function$;

revoke all on function public.dispatch_due_second_waves() from public, anon, authenticated;
grant execute on function public.dispatch_due_second_waves() to service_role;

-- alert_undispatched_bookings as it was (supabase/migrations/20261025110000_alert_unaccepted_bookings.sql)
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
     where b.status = 'pending'
       and b.driver_id is null
       and b.dispatch_alert_sent_at is null
       and b.created_at < now() - interval '5 minutes'
       and b.created_at > now() - interval '24 hours'
     order by b.created_at
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
                 || ' · ' || r.reached || ' მძღოლს მიუვიდა, 5 წუთში არავინ აიღო';
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

revoke all on function public.alert_undispatched_bookings() from public, anon, authenticated;
grant execute on function public.alert_undispatched_bookings() to service_role;

-- bookings_guard_ownership as it was (supabase/migrations/20261101150000_booking_ownership.sql)
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

-- what the migration added
drop function if exists public.driver_matching_open_jobs(uuid);
drop function if exists public.dispatch_due_third_waves();
drop function if exists public.booking_dispatch_launch(uuid);
drop function if exists public.booking_start_label_ka(text);
drop function if exists public.booking_dispatch_pool(uuid, boolean, uuid);
drop function if exists public.capacity_tier_max_seats(text);

alter table public.dispatch_log drop column if exists wave3_token_count;
alter table public.dispatch_log drop column if exists wave3_driver_ids;
alter table public.bookings drop column if exists dispatch_wave3_sent_at;
alter table public.bookings drop column if exists dispatch_wave3_due_at;
alter table public.bookings drop column if exists dispatch_launched_at;

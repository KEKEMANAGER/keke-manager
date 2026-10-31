-- Read-only snapshot of the PRODUCTION reminder and automatic-replacement
-- functions, captured on 2026-10-31 from the live catalog of project
-- brrjuxgxmpgvkddcuaad with SELECT queries only (no rows, no secrets).
--
-- Load after prod_booking_lifecycle_snapshot_2026-10-31.sql, which holds the
-- tables and the shared helpers (booking_busy_window, booking_notify, ...).
-- Test fixture only: not a migration, not the production baseline.
--
-- md5(pg_get_functiondef) at capture time, to re-compare before applying a
-- migration that replaces any of these:
-- booking_type_label_ka=aa2a9a199eafec3d5ae68d7832e5f220, confirm_booking_as_driver=2e8d5168086ca28cc1f7cb500d447e9c, driver_matches_booking_category=679891a266867f3b7db11992d4929b19, driver_matches_required_languages=cf646a5e71515ed02db9ac17da248659, driver_rank_scores=b667743d0b983b507ae27286c2450b8e, find_replacement_driver_for_booking=90ba14239c0a80f344771b89e12d6bc9, reassign_booking_to_driver=10d6da93781693827d7fe3fb35536679, run_booking_reminders=108898ec9038d0aa2faac1907ba65eee

set check_function_bodies = off;

-- ===================================================== FUNCTIONS

CREATE OR REPLACE FUNCTION public.booking_type_label_ka(p_kind text, p_booking_type text, p_flight_direction text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer'))
      IN ('transfer_arrival', 'transfer') AND lower(trim(coalesce(p_flight_direction, ''))) = 'arrival'
      THEN 'ტრანსფერი — ჩამოსვლა'
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer'))
      IN ('transfer_departure', 'transfer') AND lower(trim(coalesce(p_flight_direction, ''))) = 'departure'
      THEN 'ტრანსფერი — გამგზავრება'
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer')) = 'tour'
      THEN 'ტური'
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer')) IN ('day_tour', 'daytour', 'day tour')
      THEN 'ერთდღიანი ტური'
    ELSE 'ტრანსფერი'
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_booking_as_driver(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  caller uuid := auth.uid();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;
  if caller is null or caller <> b.driver_id then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ეს ჯავშანი შენზე არ არის');
  end if;
  if b.status not in ('accepted', 'in_progress') then
    return jsonb_build_object('ok', false, 'code', 'bad_status',
      'message', 'ჯავშანი სხვა მდგომარეობაშია');
  end if;

  update public.bookings
     set driver_confirmed_1h = true,
         driver_confirmed_at = coalesce(driver_confirmed_at, now()),
         updated_at = now()
   where id = p_booking_id;

  if b.company_id is not null then
    perform public.booking_notify(
      b.company_id,
      'KEKE Manager',
      coalesce(nullif(trim(b.driver_display_name), ''), 'მძღოლმა') || ' დაადასტურა ჯავშანი',
      'booking_driver_confirmed',
      jsonb_build_object('type', 'booking_driver_confirmed', 'bookingId', p_booking_id::text)
    );
  end if;

  return jsonb_build_object('ok', true, 'code', 'confirmed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.driver_matches_booking_category(p_is_guide boolean, p_is_hired boolean, p_category text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(trim(coalesce(p_category, 'all')))
    WHEN 'guide' THEN coalesce(p_is_hired, false) = false AND coalesce(p_is_guide, false) = true
    WHEN 'own_vehicle' THEN coalesce(p_is_hired, false) = false AND coalesce(p_is_guide, false) = false
    ELSE coalesce(p_is_hired, false) = false
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.driver_matches_required_languages(p_driver_langs text[], p_required text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT
    p_required IS NULL
    OR cardinality(p_required) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(p_driver_langs, ARRAY[]::text[])) dl
      JOIN unnest(p_required) req ON lower(trim(dl)) = lower(trim(req))
    );
$function$
;

CREATE OR REPLACE FUNCTION public.driver_rank_scores(p_driver_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(driver_id uuid, display_rating numeric, rating_count integer, bayes_rating numeric, confirm_rate numeric, completion_rate numeric, completed_count integer, is_new_driver boolean, rank_score numeric, last_dispatched_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with raw as (
    select coalesce(sum(overall), 0)::numeric as gs, count(*)::numeric as gn
      from public.ratings where overall is not null
  ),
  g as (
    select (raw.gs + 4.3 * 10) / (raw.gn + 10) as m, 5::numeric as c
      from raw
  ),
  r as (
    select ra.driver_id as did,
           sum(ra.overall)::numeric as s,
           count(*)::numeric as n
      from public.ratings ra
     where ra.driver_id is not null and ra.overall is not null
     group by ra.driver_id
  ),
  bk as (
    select bo.driver_id as did,
           count(*) filter (where bo.reminder_1h_sent is true)::numeric as asked,
           count(*) filter (where bo.driver_confirmed_1h is true)::numeric as confirmed,
           count(*) filter (where bo.status = 'completed')::numeric as completed,
           count(*) filter (where bo.status = 'cancelled' and bo.cancelled_by = 'driver')::numeric as drv_cancelled
      from public.bookings bo
     where bo.driver_id is not null
     group by bo.driver_id
  ),
  base as (
    select
      u.id as did,
      u.last_dispatched_at as last_disp,
      coalesce(r.n, 0) as n,
      coalesce(r.s, 0) as s,
      (g.c * g.m + coalesce(r.s, 0)) / (g.c + coalesce(r.n, 0)) as bayes,
      (coalesce(bk.confirmed, 0) + 3) / (coalesce(bk.asked, 0) + 4) as conf,
      (coalesce(bk.completed, 0) + 3)
        / (coalesce(bk.completed, 0) + coalesce(bk.drv_cancelled, 0) + 4) as compl,
      coalesce(bk.completed, 0) as done
    from public.users u
    cross join g
    left join r  on r.did  = u.id
    left join bk on bk.did = u.id
    where u.role = 'driver'
      and (p_driver_ids is null or u.id = any (p_driver_ids))
  )
  select
    base.did,
    case when base.n > 0 then round(base.s / base.n, 2) else 0::numeric end,
    base.n::integer,
    round(base.bayes, 3),
    round(base.conf, 3),
    round(base.compl, 3),
    base.done::integer,
    (base.done < 5),
    round(
      0.60 * ((base.bayes - 1) / 4)
    + 0.25 * base.conf
    + 0.15 * base.compl
    , 4),
    base.last_disp
  from base;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w record;
begin
  select * into w from public.booking_busy_window(p_booking_id);
  if w.win_start is null then
    return false;
  end if;

  delete from public.driver_schedules
   where booking_id = p_booking_id and source = 'booking';

  begin
    insert into public.driver_schedules
      (driver_id, vehicle_id, booking_id, start_time, end_time, source)
    values
      (p_new_driver_id, p_vehicle_id, p_booking_id, w.win_start, w.win_end, 'booking');
  exception when exclusion_violation then
    return false;
  end;

  update public.bookings
     set driver_id = p_new_driver_id,
         driver_display_name = nullif(trim(p_display_name), ''),
         driver_phone = nullif(trim(p_phone), ''),
         driver_plate = nullif(trim(p_plate), ''),
         vehicle_id = p_vehicle_id,
         status = 'accepted',
         driver_confirmed_1h = null,
         driver_confirmed_at = null,
         reminder_3h_sent = false,
         reminder_3h_sent_at = null,
         reminder_1h_sent = false,
         reminder_1h_sent_at = null,
         reminder_45m_sent = false,
         reminder_45m_sent_at = null,
         reassign_count = coalesce(reassign_count, 0) + 1,
         updated_at = now()
   where id = p_booking_id;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_booking_reminders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  rep record;
  start_ts timestamptz;
  mins_until numeric;
  route text;
  type_label text;
  date_label text;
  old_driver uuid;
  did_reassign boolean;
  n12 int := 0;
  n3 int := 0;
  n1 int := 0;
  n45 int := 0;
  n_reassigned int := 0;
  n_company int := 0;
begin
  for r in
    select * from public.bookings b
     where b.driver_id is not null
       and b.status in ('accepted', 'in_progress')
       and b.date_display is not null
       and trim(b.date_display) <> ''
  loop
    start_ts := public.parse_booking_start_ts(r.date_display);
    if start_ts is null or start_ts <= now() then
      continue;
    end if;

    mins_until := extract(epoch from (start_ts - now())) / 60.0;
    if mins_until > 13 * 60 then
      continue;
    end if;

    route      := public.booking_route_summary(r.from_location, r.to_location, r.route::text);
    type_label := public.booking_type_label_ka(r.kind, r.booking_type, r.flight_direction);
    date_label := to_char(start_ts at time zone 'Asia/Tbilisi', 'DD.MM.YYYY, HH24:MI');

    ------------------------------------------------------------------ 12 hours
    if not coalesce(r.reminder_24h_sent, false)
       and mins_until between 11 * 60 and 13 * 60 then
      perform public.booking_notify(
        r.driver_id, 'KEKE Manager',
        '12 საათში გაქვს ' || type_label || ': ' || route || ' — ' || date_label,
        'booking_reminder_12h',
        jsonb_build_object('type', 'booking_reminder_12h', 'bookingId', r.id::text));
      update public.bookings set reminder_24h_sent = true where id = r.id;
      n12 := n12 + 1;
    end if;

    ------------------------------------------------------------- 3 hours (ask)
    if not coalesce(r.reminder_3h_sent, false)
       and r.driver_confirmed_1h is distinct from true
       and mins_until between 165 and 200 then
      perform public.booking_notify(
        r.driver_id, 'KEKE Manager',
        '3 საათში გაქვს ' || type_label || ': ' || route || ' — ' || date_label
          || '. შეძლებ? გთხოვ დაადასტურე',
        'booking_reminder_confirm',
        jsonb_build_object('type', 'booking_reminder_confirm',
                           'bookingId', r.id::text, 'stage', '3h'));
      update public.bookings
         set reminder_3h_sent = true, reminder_3h_sent_at = now()
       where id = r.id;
      n3 := n3 + 1;
      continue;
    end if;

    ------------------------------- escalate 40 min after an unanswered 3h ask
    if coalesce(r.reminder_3h_sent, false)
       and r.driver_confirmed_1h is distinct from true
       and r.reminder_3h_sent_at is not null
       and now() - r.reminder_3h_sent_at >= interval '40 minutes'
       and mins_until > 70
       and coalesce(r.reassign_count, 0) < 3 then

      old_driver := r.driver_id;
      rep := null;
      select * into rep
        from public.find_replacement_driver_for_booking(r.id, old_driver) limit 1;

      did_reassign := false;
      if rep.driver_id is not null then
        did_reassign := public.reassign_booking_to_driver(
          r.id, rep.driver_id, rep.vehicle_id, rep.full_name, rep.phone, rep.vehicle_plate);
      end if;

      if did_reassign then
        perform public.booking_notify(
          rep.driver_id, 'KEKE Manager',
          'გადმოგეცა ' || type_label || ': ' || route || ' — ' || date_label
            || '. გთხოვ დაადასტურე',
          'booking_reassigned',
          jsonb_build_object('type', 'booking_reassigned', 'bookingId', r.id::text));
        perform public.booking_notify(
          old_driver, 'KEKE Manager',
          'ჯავშანი სხვა მძღოლს გადაეცა, რადგან დროულად არ დაადასტურე: ' || route,
          'booking_taken_away',
          jsonb_build_object('type', 'booking_taken_away', 'bookingId', r.id::text));
        perform public.booking_notify(
          r.company_id, 'KEKE Manager',
          'მძღოლმა ვერ დაადასტურა. ჯავშანი ავტომატურად გადავიდა: '
            || coalesce(nullif(trim(rep.full_name), ''), 'ახალი მძღოლი'),
          'booking_auto_reassigned',
          jsonb_build_object('type', 'booking_auto_reassigned', 'bookingId', r.id::text));
        n_reassigned := n_reassigned + 1;
      end if;
      continue;
    end if;

    -------------------------------------------------------------- 1 hour (ask)
    if not coalesce(r.reminder_1h_sent, false)
       and r.driver_confirmed_1h is distinct from true
       and mins_until between 52 and 75 then
      perform public.booking_notify(
        r.driver_id, 'KEKE Manager',
        '1 საათში იწყება ' || type_label || ': ' || route
          || '. აუცილებლად დაადასტურე',
        'booking_reminder_confirm',
        jsonb_build_object('type', 'booking_reminder_confirm',
                           'bookingId', r.id::text, 'stage', '1h'));
      update public.bookings
         set reminder_1h_sent = true, reminder_1h_sent_at = now()
       where id = r.id;
      n1 := n1 + 1;
      continue;
    end if;

    ------------------------------------------------- 45 minutes (final + swap)
    if not coalesce(r.reminder_45m_sent, false)
       and r.driver_confirmed_1h is distinct from true
       and mins_until between 36 and 51 then

      perform public.booking_notify(
        r.driver_id, 'KEKE Manager',
        '45 წუთში იწყება ' || type_label || ': ' || route
          || '. ბოლო შეხსენება — თუ ახლავე არ დაადასტურებ, ჯავშანი სხვას გადაეცემა',
        'booking_reminder_final',
        jsonb_build_object('type', 'booking_reminder_final',
                           'bookingId', r.id::text, 'stage', '45m'));
      update public.bookings
         set reminder_45m_sent = true, reminder_45m_sent_at = now()
       where id = r.id;
      n45 := n45 + 1;

      old_driver := r.driver_id;
      rep := null;
      did_reassign := false;
      if coalesce(r.reassign_count, 0) < 3 then
        select * into rep
          from public.find_replacement_driver_for_booking(r.id, old_driver) limit 1;
        if rep.driver_id is not null then
          did_reassign := public.reassign_booking_to_driver(
            r.id, rep.driver_id, rep.vehicle_id, rep.full_name, rep.phone, rep.vehicle_plate);
        end if;
      end if;

      if did_reassign then
        perform public.booking_notify(
          rep.driver_id, 'KEKE Manager',
          'სასწრაფოდ გადმოგეცა ' || type_label || ': ' || route || ' — ' || date_label
            || '. გთხოვ დაადასტურე ახლავე',
          'booking_reassigned',
          jsonb_build_object('type', 'booking_reassigned', 'bookingId', r.id::text));
        perform public.booking_notify(
          r.company_id, 'KEKE Manager',
          'მძღოლმა ვერ დაადასტურა. ჯავშანი გადავიდა: '
            || coalesce(nullif(trim(rep.full_name), ''), 'ახალი მძღოლი')
            || ' (' || date_label || ')',
          'booking_auto_reassigned',
          jsonb_build_object('type', 'booking_auto_reassigned', 'bookingId', r.id::text));
        n_reassigned := n_reassigned + 1;
      elsif not coalesce(r.company_unconfirmed_alert_sent, false) then
        perform public.booking_notify(
          r.company_id, 'KEKE Manager',
          'ყურადღება: მძღოლმა არ დაადასტურა ჯავშანი (' || route || ', ' || date_label
            || ') და თავისუფალი მძღოლი ვერ მოიძებნა — საჭიროა ხელით დანიშვნა',
          'booking_driver_unconfirmed',
          jsonb_build_object('type', 'booking_driver_unconfirmed', 'bookingId', r.id::text));
        update public.bookings set company_unconfirmed_alert_sent = true where id = r.id;
        n_company := n_company + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sent12h', n12,
    'sent3h', n3,
    'sent1h', n1,
    'sent45m', n45,
    'reassigned', n_reassigned,
    'notifiedCompany', n_company
  );
end;
$function$
;

-- ===================================================== FUNCTION ACLS

revoke all on function public.booking_type_label_ka(p_kind text, p_booking_type text, p_flight_direction text) from public;
grant execute on function public.booking_type_label_ka(p_kind text, p_booking_type text, p_flight_direction text) to anon;
grant execute on function public.booking_type_label_ka(p_kind text, p_booking_type text, p_flight_direction text) to authenticated;
grant execute on function public.booking_type_label_ka(p_kind text, p_booking_type text, p_flight_direction text) to public;
grant execute on function public.booking_type_label_ka(p_kind text, p_booking_type text, p_flight_direction text) to service_role;
revoke all on function public.confirm_booking_as_driver(p_booking_id uuid) from public;
grant execute on function public.confirm_booking_as_driver(p_booking_id uuid) to authenticated;
grant execute on function public.confirm_booking_as_driver(p_booking_id uuid) to service_role;
revoke all on function public.driver_matches_booking_category(p_is_guide boolean, p_is_hired boolean, p_category text) from public;
grant execute on function public.driver_matches_booking_category(p_is_guide boolean, p_is_hired boolean, p_category text) to anon;
grant execute on function public.driver_matches_booking_category(p_is_guide boolean, p_is_hired boolean, p_category text) to authenticated;
grant execute on function public.driver_matches_booking_category(p_is_guide boolean, p_is_hired boolean, p_category text) to public;
grant execute on function public.driver_matches_booking_category(p_is_guide boolean, p_is_hired boolean, p_category text) to service_role;
revoke all on function public.driver_matches_required_languages(p_driver_langs text[], p_required text[]) from public;
grant execute on function public.driver_matches_required_languages(p_driver_langs text[], p_required text[]) to anon;
grant execute on function public.driver_matches_required_languages(p_driver_langs text[], p_required text[]) to authenticated;
grant execute on function public.driver_matches_required_languages(p_driver_langs text[], p_required text[]) to public;
grant execute on function public.driver_matches_required_languages(p_driver_langs text[], p_required text[]) to service_role;
revoke all on function public.driver_rank_scores(p_driver_ids uuid[]) from public;
grant execute on function public.driver_rank_scores(p_driver_ids uuid[]) to authenticated;
grant execute on function public.driver_rank_scores(p_driver_ids uuid[]) to service_role;
revoke all on function public.find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid) from public;
grant execute on function public.find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid) to service_role;
revoke all on function public.reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text) from public;
grant execute on function public.reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text) to service_role;
revoke all on function public.run_booking_reminders() from public;
grant execute on function public.run_booking_reminders() to service_role;

reset check_function_bodies;

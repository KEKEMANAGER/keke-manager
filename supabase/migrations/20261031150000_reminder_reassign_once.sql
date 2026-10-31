-- P0-2 · The reminder worker replaces an unconfirmed driver at most once,
-- never touches a trip that has started, and tells people instead of
-- swapping again.
--
-- Before (production as of 2026-10-31):
--   * reassign_booking_to_driver reset every reminder flag and the
--     confirmation, and run_booking_reminders runs every minute, so at the
--     45-minute stage the brand-new driver was "unconfirmed" again one
--     minute later and the booking moved again, up to 3 times;
--   * the worker scanned 'in_progress' bookings and the helper set them back
--     to 'accepted' with another driver;
--   * at the 45-minute stage the driver who lost the job was not told;
--   * a 3-hour escalation that found no replacement retried every minute and
--     told nobody;
--   * a swap refused by the calendar guard had already deleted the current
--     driver's calendar block;
--   * nothing stopped two runs from working on the same booking at once.
--
-- After:
--   * at most one automatic replacement per booking, only while it is
--     'accepted' and its driver has not confirmed (checked again under a
--     row lock, so a confirm that lands meanwhile wins);
--   * the replacement gets a 10-minute quiet period; if he was given the job
--     past the 45-minute stage and is still silent afterwards, the company
--     is told once; no second swap ever;
--   * no safe replacement -> the company is told once;
--   * the driver who loses the job is told at both stages;
--   * a refused swap leaves the calendar exactly as it was;
--   * one run at a time (transaction-level advisory lock).
--
-- Only these two functions change, plus one new column; everything else in
-- them is the production definition of 2026-10-31. Nothing here changes
-- existing rows. This migration does not depend on P0-1 and can be applied
-- before or after it.
--
-- BEFORE APPLYING: confirm production still has the definitions this was
-- written against (otherwise newer production changes would be overwritten):
--   select proname, md5(pg_get_functiondef(oid)) from pg_proc
--    where proname in ('run_booking_reminders', 'reassign_booking_to_driver');
--   expected: run_booking_reminders      108898ec9038d0aa2faac1907ba65eee
--             reassign_booking_to_driver 10d6da93781693827d7fe3fb35536679
-- Undo:  supabase/rollback/20261031150000_reminder_reassign_once_undo.sql
-- Tests: supabase/tests/p0_2_reminder_reassign.test.sql (supabase/tests/README.md)

alter table public.bookings add column if not exists auto_reassigned_at timestamptz;

comment on column public.bookings.auto_reassigned_at is
  'When run_booking_reminders handed this booking to a replacement driver (at most once). Starts the replacement''s quiet period.';

-- 1. The swap itself ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w record;
  b record;
begin
  -- P0-2: lock the booking and look at it as it is now. Only a booking that
  -- is still 'accepted', still unconfirmed and never replaced before can be
  -- handed to someone else: a started trip, a driver who has just confirmed,
  -- or a second automatic swap are refused.
  select status, driver_id, driver_confirmed_1h, coalesce(reassign_count, 0) as n_reassigned
    into b
    from public.bookings
   where id = p_booking_id
   for update;
  if not found
     or b.status is distinct from 'accepted'
     or b.driver_confirmed_1h is true
     or b.n_reassigned >= 1
     or b.driver_id is not distinct from p_new_driver_id then
    return false;
  end if;

  select * into w from public.booking_busy_window(p_booking_id);
  if w.win_start is null then
    return false;
  end if;

  -- P0-2: the old calendar block is removed inside the same protected step
  -- as the new one is added, so a refused swap leaves it in place.
  begin
    delete from public.driver_schedules
     where booking_id = p_booking_id and source = 'booking';

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
         auto_reassigned_at = now(),
         updated_at = now()
   where id = p_booking_id;

  return true;
end;
$function$;

revoke all on function public.reassign_booking_to_driver(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.reassign_booking_to_driver(uuid, uuid, uuid, text, text, text) to service_role;

-- 2. The reminder worker (cron: booking-reminders-hourly, every minute) ---------

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
  still_open boolean;
  -- P0-2: how long a driver who was just given a job automatically has to
  -- answer before anything else happens to that booking.
  quiet constant interval := interval '10 minutes';
begin
  -- P0-2: one run at a time. A run that starts while another is still
  -- working (a slow minute, a manual call) steps aside instead of acting on
  -- the same bookings twice.
  if not pg_try_advisory_xact_lock(hashtext('public.run_booking_reminders')) then
    return jsonb_build_object('ok', true, 'skipped', 'another run is in progress');
  end if;

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

    -- P0-2: everything below is about confirming and replacing. A trip that
    -- has already started has nothing to confirm and is never replaced.
    if r.status is distinct from 'accepted' then
      continue;
    end if;

    -- P0-2: after an automatic replacement the new driver gets a quiet
    -- period: no asks, no further swap, no alert. If he was given the job
    -- late (past the 45-minute stage) and is still silent when it ends, the
    -- company is told once. There is never a second automatic swap.
    if r.auto_reassigned_at is not null then
      if now() - r.auto_reassigned_at < quiet then
        continue;
      end if;
      if r.driver_confirmed_1h is distinct from true
         and mins_until < 36
         and not coalesce(r.company_unconfirmed_alert_sent, false) then
        perform public.booking_notify(
          r.company_id, 'KEKE Manager',
          'ყურადღება: შემცვლელმა მძღოლმა ჯერ არ დაადასტურა ჯავშანი (' || route || ', ' || date_label
            || ') — გადაამოწმე ან დანიშნე ხელით',
          'booking_driver_unconfirmed',
          jsonb_build_object('type', 'booking_driver_unconfirmed', 'bookingId', r.id::text));
        update public.bookings set company_unconfirmed_alert_sent = true where id = r.id;
        n_company := n_company + 1;
        continue;
      end if;
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
       -- P0-2: one automatic attempt per booking (was: up to 3 swaps)
       and coalesce(r.reassign_count, 0) < 1
       and not coalesce(r.company_unconfirmed_alert_sent, false) then

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
      else
        -- P0-2: no safe replacement: tell the company once instead of
        -- searching again every minute — if the job is still unconfirmed.
        select b2.status = 'accepted' and b2.driver_id = old_driver
               and b2.driver_confirmed_1h is distinct from true
          into still_open
          from public.bookings b2 where b2.id = r.id;
        if coalesce(still_open, false) then
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
          -- P0-2: no "it will go to someone else" once a swap is no longer possible
          || case when coalesce(r.reassign_count, 0) < 1
                       and not coalesce(r.company_unconfirmed_alert_sent, false)
                  then '. ბოლო შეხსენება — თუ ახლავე არ დაადასტურებ, ჯავშანი სხვას გადაეცემა'
                  else '. ბოლო შეხსენება — გთხოვ დაადასტურე ახლავე' end,
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
      -- P0-2: one automatic attempt per booking (was: up to 3 swaps)
      if coalesce(r.reassign_count, 0) < 1
         and not coalesce(r.company_unconfirmed_alert_sent, false) then
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
        -- P0-2: the driver who loses the job is told, as at the 3-hour stage,
        -- so he does not drive to the pickup as well.
        perform public.booking_notify(
          old_driver, 'KEKE Manager',
          'ჯავშანი სხვა მძღოლს გადაეცა, რადგან დროულად არ დაადასტურე: ' || route,
          'booking_taken_away',
          jsonb_build_object('type', 'booking_taken_away', 'bookingId', r.id::text));
        perform public.booking_notify(
          r.company_id, 'KEKE Manager',
          'მძღოლმა ვერ დაადასტურა. ჯავშანი გადავიდა: '
            || coalesce(nullif(trim(rep.full_name), ''), 'ახალი მძღოლი')
            || ' (' || date_label || ')',
          'booking_auto_reassigned',
          jsonb_build_object('type', 'booking_auto_reassigned', 'bookingId', r.id::text));
        n_reassigned := n_reassigned + 1;
      elsif not coalesce(r.company_unconfirmed_alert_sent, false) then
        -- P0-2: only if the job is still unconfirmed in this driver's hands
        -- (he may have confirmed while this run was working).
        select b2.status = 'accepted' and b2.driver_id = old_driver
               and b2.driver_confirmed_1h is distinct from true
          into still_open
          from public.bookings b2 where b2.id = r.id;
        if coalesce(still_open, false) then
          perform public.booking_notify(
            r.company_id, 'KEKE Manager',
            case when coalesce(r.reassign_count, 0) >= 1
                 then 'ყურადღება: შემცვლელმა მძღოლმა ჯერ არ დაადასტურა ჯავშანი (' || route || ', ' || date_label
                        || ') — გადაამოწმე ან დანიშნე ხელით'
                 else 'ყურადღება: მძღოლმა არ დაადასტურა ჯავშანი (' || route || ', ' || date_label
                        || ') და თავისუფალი მძღოლი ვერ მოიძებნა — საჭიროა ხელით დანიშვნა' end,
            'booking_driver_unconfirmed',
            jsonb_build_object('type', 'booking_driver_unconfirmed', 'bookingId', r.id::text));
          update public.bookings set company_unconfirmed_alert_sent = true where id = r.id;
          n_company := n_company + 1;
        end if;
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
$function$;

revoke all on function public.run_booking_reminders() from public;
grant execute on function public.run_booking_reminders() to service_role;

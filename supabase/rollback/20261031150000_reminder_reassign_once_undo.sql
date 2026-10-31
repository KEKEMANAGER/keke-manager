-- Undo of 20261031150000_reminder_reassign_once.sql: puts back the
-- production definitions captured on 2026-10-31 (verbatim) and removes the
-- auto_reassigned_at column. Run only on purpose, as one transaction.
-- After the undo the P0-2 bugs are back (see p0_2_bug_reproduction.sql).

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
$function$;

revoke all on function public.reassign_booking_to_driver(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.reassign_booking_to_driver(uuid, uuid, uuid, text, text, text) to service_role;

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
$function$;

revoke all on function public.run_booking_reminders() from public;
grant execute on function public.run_booking_reminders() to service_role;

alter table public.bookings drop column if exists auto_reassigned_at;

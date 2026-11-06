-- KEKE's admins hear about every booking (asked for by the founder, 6 Nov 2026:
-- "ყველა ჯავშანი უნდა მომდიოს ... რომ ვაკონტროლო").
--
-- One notification to every admin (in the app, on the phone and in the
-- browser - booking_notify, as every other notice) when:
--   * a booking is created: its code, the company, the route, the start in
--     Tbilisi time, the car, the passengers and the price (and the driver, when
--     the company gave it to one by name);
--   * a driver takes it (or is given it): who, with which car, and who had it
--     before when it moved from one driver to another;
--   * it is cancelled: by the company, the driver or KEKE;
--   * it is open again after a driver had it (he left it, or it was
--     reassigned): who had it;
--   * it is rejected.
-- Convoy coordinator rows are not trips and say nothing; each car of a convoy
-- does. A failure here never stops the booking itself: it is reported as a
-- warning and the booking goes on.
--
-- Only in the app (the founder does not want Telegram, 6 Nov 2026).
--
-- Changes no existing row. Undo: supabase/rollback/20261106150000_admin_booking_feed_undo.sql

create or replace function public.admin_booking_feed_message(b public.bookings, p_event text, p_old_driver uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code    text := coalesce(nullif(trim(b.voucher_code), ''), left(b.id::text, 8));
  v_route   text := public.booking_route_summary(b.from_location, b.to_location, b.route::text);
  v_start   text := public.booking_start_label_ka(b.date_display);
  v_company text;
  v_driver  text;
  v_before  text;
  v_car     text;
  v_price   text;
  v_vehicle text;
  v_title   text;
  v_body    text;
  who       text;
begin
  select coalesce(nullif(trim(u.company_name), ''), nullif(trim(u.full_name), ''), 'კომპანია')
    into v_company from public.users u where u.id = b.company_id;
  v_vehicle := concat_ws(' ',
    case lower(coalesce(b.vehicle_type, ''))
      when 'sedan' then 'სედანი' when 'minivan' then 'მინივენი' when 'microbus' then 'მიკროავტობუსი'
      when 'bus' then 'ავტობუსი' when 'suv' then 'ჯიპი' when 'offroad' then 'ჯიპი'
      else nullif(trim(b.vehicle_type), '') end,
    case lower(coalesce(b.vehicle_class, ''))
      when 'economy' then 'ეკონომი' when 'comfort' then 'კომფორტი' when 'business' then 'VIP' when 'vip' then 'VIP'
      else nullif(trim(b.vehicle_class), '') end,
    case when b.requested_capacity_tier ~ '_\d+_\d+$' then '(' || regexp_replace(b.requested_capacity_tier, '^.*_(\d+)_(\d+)$', '\1–\2') || ' ადგ.)'
         when b.requested_capacity_tier ~ '_\d+$' then '(' || regexp_replace(b.requested_capacity_tier, '^.*_(\d+)$', '\1') || ' ადგ.)' end);
  v_price := case when b.price_gel is null then null
                  else regexp_replace(regexp_replace(b.price_gel::numeric::text, '(\.\d*?)0+$', '\1'), '\.$', '') || ' ₾' end;

  if p_event in ('created', 'taken', 'reopened', 'cancelled') then
    select coalesce(nullif(trim(case when p_event = 'reopened' then null else b.driver_display_name end), ''), nullif(trim(u.full_name), ''))
      into v_driver from public.users u where u.id = case when p_event = 'reopened' then p_old_driver else b.driver_id end;
  end if;
  if p_event = 'taken' and p_old_driver is not null and p_old_driver is distinct from b.driver_id then
    -- given to another driver (KEKE's replacement when the first did not confirm)
    select nullif(trim(u.full_name), '') into v_before from public.users u where u.id = p_old_driver;
    v_before := coalesce(v_before, 'სხვა მძღოლი');
  end if;
  if p_event = 'taken' then
    select concat_ws(' ', nullif(trim(v.model), ''), nullif(trim(coalesce(b.driver_plate, v.plate)), ''))
      into v_car
      from public.vehicles v
     where v.id = b.vehicle_id
        or (b.vehicle_id is null and v.driver_id = b.driver_id and v.type = b.vehicle_type and v.verification_status = 'approved')
     order by (v.id = b.vehicle_id) desc nulls last, v.is_active desc
     limit 1;
  end if;

  case p_event
    when 'created' then
      v_title := 'KEKE · ახალი ჯავშანი';
      v_body  := concat_ws(' · ', v_code, v_company, v_route, v_start, nullif(v_vehicle, ''),
                           case when b.passengers is not null then b.passengers || ' მგზ.' end, v_price,
                           case when v_driver is not null then
                             case when b.status = 'pending' then 'შეთავაზება: ' else 'მძღოლი: ' end || v_driver end);
    when 'taken' then
      v_title := 'KEKE · ჯავშანი აიღეს';
      v_body  := concat_ws(' · ', v_code, coalesce(v_driver, 'მძღოლი') || coalesce(' (' || nullif(v_car, '') || ')', ''),
                           case when v_before is not null then 'ადრე: ' || v_before end,
                           v_route, v_start, v_price);
    when 'cancelled' then
      who := case lower(coalesce(b.cancelled_by, ''))
               when 'company' then 'კომპანიამ (' || v_company || ')'
               when 'driver'  then 'მძღოლმა' || coalesce(' (' || v_driver || ')', '')
               when 'admin'   then 'KEKE-მ'
               when 'system'  then 'სისტემამ'
               else null end;
      v_title := 'KEKE · ჯავშანი გაუქმდა';
      v_body  := concat_ws(' · ', v_code, case when who is not null then 'გააუქმა ' || who end,
                           case when lower(coalesce(b.cancelled_by, '')) = 'company' then null else v_company end,   -- named once
                           v_route, v_start);
    when 'reopened' then
      v_title := 'KEKE · ჯავშანი ისევ ღიაა';
      v_body  := concat_ws(' · ', v_code, coalesce(v_driver, 'მძღოლი') || ' აღარ არის', v_company, v_route, v_start);
    when 'rejected' then
      v_title := 'KEKE · ჯავშანი უარყოფილია';
      v_body  := concat_ws(' · ', v_code, v_company, v_route, v_start);
    else
      return null;
  end case;

  return jsonb_build_object('title', v_title, 'body', v_body,
                            'data', jsonb_build_object('booking_id', b.id::text, 'event', p_event, 'code', v_code));
end;
$$;

create or replace function public.bookings_admin_feed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  msg     jsonb;
  a       record;
begin
  if coalesce(new.is_group_master, false) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_event := 'created';
  elsif new.status is distinct from old.status then
    v_event := case
      when new.status = 'cancelled' then 'cancelled'
      when new.status = 'rejected' then 'rejected'
      when new.status = 'accepted' and new.driver_id is not null then 'taken'
      when new.status = 'pending' and old.driver_id is not null and new.driver_id is null then 'reopened'
      else null end;
  elsif new.driver_id is distinct from old.driver_id and new.driver_id is not null and new.status = 'accepted' then
    v_event := 'taken';   -- another driver given an already taken booking
  end if;
  if v_event is null then
    return null;
  end if;

  begin
    msg := public.admin_booking_feed_message(new, v_event, case when tg_op = 'UPDATE' then old.driver_id end);
    if msg is null then
      return null;
    end if;
    for a in select u.id from public.users u where u.role = 'admin' loop
      perform public.deliver_notification(a.id, msg ->> 'title', msg ->> 'body', 'admin_booking_feed', msg -> 'data', null);
    end loop;
  exception when others then
    raise warning 'bookings_admin_feed: % % (booking %, %)', sqlstate, sqlerrm, new.id, v_event;
  end;
  return null;
end;
$$;

drop trigger if exists bookings_admin_feed on public.bookings;
create trigger bookings_admin_feed
  after insert or update of status, driver_id on public.bookings
  for each row execute function public.bookings_admin_feed();

revoke all on function public.admin_booking_feed_message(public.bookings, text, uuid) from public, anon, authenticated;
revoke all on function public.bookings_admin_feed() from public, anon, authenticated;
grant execute on function public.admin_booking_feed_message(public.bookings, text, uuid) to service_role;

comment on function public.bookings_admin_feed() is
  'Every admin hears about every booking: created, taken, cancelled, open again, rejected (type admin_booking_feed). Never stops the booking: a failure is a warning.';

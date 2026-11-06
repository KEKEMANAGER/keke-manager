-- KEKE admin booking feed release - step 1: apply
-- Source: supabase/migrations/20261106150000_admin_booking_feed.sql (md5 64d619a1064df8fd249084ce71382936)
-- Run as ONE call (Supabase SQL editor / MCP execute_sql). It commits only if every
-- check passes; otherwise it rolls back and nothing changes. No existing row is changed
-- and nobody is notified by running it.
-- Built by docs/admin-feed-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $state$
declare step text := 'admin feed (before)'; f record; got text;
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261106150000') then
    raise exception '%: already in the migration history - stop', step;
  end if;
  for f in select * from (values ('deliver_notification(uuid,text,text,text,jsonb,text)', 'cc3e7c5df5c30bcef205a9b018f6fd9d'),
    ('booking_notify(uuid,text,text,text,jsonb)', '6bfc41655ab690cd4a61c6a547559ec1'),
    ('booking_route_summary(text,text,text)', '1b830dc85c45cca1be96e87fe1b8bfca'),
    ('booking_start_label_ka(text)', 'ca2325c1509bc88173daa3876713e286'),
    ('send_expo_push(text,text,text,jsonb)', 'bbfb308ab95a208ed0a6c29a3f2f4b5d'),
    ('send_web_push(uuid,text,text,jsonb)', '9219d7481ab3af8c15b7a943bdf6742f'),
    ('fetch_user_push_token(uuid)', '1a9696a1d05d91d05150c853e474e976')) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is not production''s of 2026-11-06 (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  if exists (select 1 from unnest(array['admin_booking_feed_message(public.bookings,text,uuid)', 'bookings_admin_feed()']) s where to_regprocedure('public.' || s) is not null)
     or exists (select 1 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed') then
    raise exception '%: the admin feed exists already - stop', step;
  end if;
  for f in select * from (values ('bookings','id'), ('bookings','company_id'), ('bookings','driver_id'), ('bookings','vehicle_id'), ('bookings','status'),
    ('bookings','is_group_master'), ('bookings','cancelled_by'), ('bookings','voucher_code'), ('bookings','from_location'),
    ('bookings','to_location'), ('bookings','route'), ('bookings','date_display'), ('bookings','vehicle_type'),
    ('bookings','vehicle_class'), ('bookings','requested_capacity_tier'), ('bookings','passengers'), ('bookings','price_gel'),
    ('bookings','driver_display_name'), ('bookings','driver_plate'), ('users','id'), ('users','role'), ('users','full_name'),
    ('users','company_name'), ('vehicles','id'), ('vehicles','driver_id'), ('vehicles','model'), ('vehicles','plate'),
    ('vehicles','type'), ('vehicles','verification_status'), ('vehicles','is_active')) v(tbl, col) loop
    if not exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = f.tbl and c.column_name = f.col) then
      raise exception '%: public.%.% is missing - stop', step, f.tbl, f.col;
    end if;
  end loop;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
$state$;

create temp table _snap on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(x.id::text || '/' || coalesce(x.status, '-') || '/' || coalesce(x.driver_id::text, '-')
         || '/' || coalesce(x.updated_at::text, '-'), ',' order by x.id), '')) from public.bookings x)
    || '|' || (select count(*) from public.notifications)
    || '|' || (select count(*) from public.push_outbox)
    || '|' || (select count(*) from public.users)
    || '|' || (select coalesce(string_agg(t.tgname || ' ' || t.tgenabled::text, ', ' order by t.tgname), '')
                 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal and t.tgname <> 'bookings_admin_feed') as h;

-- ===== supabase/migrations/20261106150000_admin_booking_feed.sql, verbatim =====
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
-- Telegram comes later through the same function (a second channel), once
-- KEKE has a bot.
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
      v_body  := concat_ws(' · ', v_code, case when who is not null then 'გააუქმა ' || who end, v_company, v_route, v_start);
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
-- ===== end of the migration =====

do $after$
declare step text := 'admin feed (after)'; f record; got text; s text;
begin
  for f in select * from (values ('admin_booking_feed_message(public.bookings,text,uuid)', 'c1235dff6ae92a30a340e4bcc3b95b2d'),
    ('bookings_admin_feed()', '301aa0311efa21024cbf95964768928e')) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is missing or not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  select pg_get_triggerdef(t.oid) || ' / ' || t.tgenabled::text into got
    from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed';
  if got is distinct from 'CREATE TRIGGER bookings_admin_feed AFTER INSERT OR UPDATE OF status, driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION bookings_admin_feed() / O' then
    raise exception '%: the trigger is not as intended (found %) - stop', step, coalesce(got, 'nothing');
  end if;
  -- rights: neither the apps nor anyone signed out may run either function
  foreach s in array array['admin_booking_feed_message(public.bookings,text,uuid)', 'bookings_admin_feed()'] loop
    if has_function_privilege('anon', ('public.' || s)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || s)::regprocedure, 'execute') then
      raise exception '%: the apps may run public.% - stop', step, s;
    end if;
  end loop;
  for f in select * from (values ('deliver_notification(uuid,text,text,text,jsonb,text)', 'cc3e7c5df5c30bcef205a9b018f6fd9d'),
    ('booking_notify(uuid,text,text,text,jsonb)', '6bfc41655ab690cd4a61c6a547559ec1'),
    ('booking_route_summary(text,text,text)', '1b830dc85c45cca1be96e87fe1b8bfca'),
    ('booking_start_label_ka(text)', 'ca2325c1509bc88173daa3876713e286'),
    ('send_expo_push(text,text,text,jsonb)', 'bbfb308ab95a208ed0a6c29a3f2f4b5d'),
    ('send_web_push(uuid,text,text,jsonb)', '9219d7481ab3af8c15b7a943bdf6742f'),
    ('fetch_user_push_token(uuid)', '1a9696a1d05d91d05150c853e474e976')) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is not production''s of 2026-11-06 (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  if (select h from _snap) is distinct from ((select count(*) || ':' || md5(coalesce(string_agg(x.id::text || '/' || coalesce(x.status, '-') || '/' || coalesce(x.driver_id::text, '-')
         || '/' || coalesce(x.updated_at::text, '-'), ',' order by x.id), '')) from public.bookings x)
    || '|' || (select count(*) from public.notifications)
    || '|' || (select count(*) from public.push_outbox)
    || '|' || (select count(*) from public.users)
    || '|' || (select coalesce(string_agg(t.tgname || ' ' || t.tgenabled::text, ', ' order by t.tgname), '')
                 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal and t.tgname <> 'bookings_admin_feed')) then
    raise exception '%: rows or the other booking triggers changed - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
$after$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261106150000', 'admin_booking_feed', array['-- applied from supabase/migrations/20261106150000_admin_booking_feed.sql (md5 64d619a1064df8fd249084ce71382936) by docs/admin-feed-release'], 'admin-feed-release');

select 'admin booking feed applied' as result, now() as at,
       (select count(*) from public.users where role = 'admin') as admins_who_will_hear;
commit;

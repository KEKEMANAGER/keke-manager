-- KEKE admin booking feed - smoke test with throwaway accounts, after 10_apply_admin_feed.sql.
--
-- A company and two drivers that exist only inside this transaction, and a booking
-- that exists only in memory: it is never written to the bookings table, so the
-- trigger never fires and nobody - not even an admin - is told anything. Every
-- message the feed can send is built for it and compared word for word.
--
-- Everything happens inside ONE transaction that is ROLLED BACK at the end. No real
-- row is read or changed. The last checks prove that nothing was notified or queued
-- (one snapshot: repeatable read). Every "ok" must be true.
begin isolation level repeatable read;

create temp table _smoke (n serial, check_name text, ok boolean);

do $smoke$
declare
  c   uuid := gen_random_uuid();   -- company
  d1  uuid := gen_random_uuid();   -- the first driver, with a car
  d2  uuid := gen_random_uuid();   -- the second driver, no car of his own
  car uuid := gen_random_uuid();
  b   public.bookings;
  m   jsonb;
  notices_before bigint := (select count(*) from public.notifications);
  outbox_before  bigint := (select count(*) from public.push_outbox);
  queue_before   bigint := 0;
  queue_after    bigint := 0;
  head text := 'AF-SMOKE-1';
  tail text := 'Tbilisi airport → Kazbegi · 6 ნოემბერი, 10:00';
begin
  if to_regclass('net.http_request_queue') is not null then
    execute 'select count(*) from net.http_request_queue' into queue_before;
  end if;

  insert into auth.users (id, email) values
    (c, 'af-smoke-company@kekemanager.com'), (d1, 'af-smoke-driver1@kekemanager.com'), (d2, 'af-smoke-driver2@kekemanager.com');
  insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_blocked,
                            is_available, is_hired_driver, available_for_hire, city, languages)
  values (c,  'company', 'AF smoke company', 'AF smoke tours', 'af-smoke-company@kekemanager.com', true, 'approved', false, true, false, false, 'Tbilisi', null),
         (d1, 'driver', 'AF smoke driver 1', null, 'af-smoke-driver1@kekemanager.com', true, 'approved', false, true, false, true, 'Tbilisi', array['en']),
         (d2, 'driver', 'AF smoke driver 2', null, 'af-smoke-driver2@kekemanager.com', true, 'approved', false, true, false, true, 'Tbilisi', array['en'])
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, company_name = excluded.company_name,
    email = excluded.email, is_verified = excluded.is_verified, verification_status = excluded.verification_status,
    is_blocked = excluded.is_blocked, is_available = excluded.is_available, is_hired_driver = excluded.is_hired_driver,
    available_for_hire = excluded.available_for_hire, city = excluded.city, languages = excluded.languages;
  insert into public.vehicles (id, driver_id, type, class, capacity_tier, model, plate, verification_status, is_verified, is_active)
  values (car, d1, 'minivan', 'economy', 'minivan_3_5', 'AF smoke', 'AFSMOKE-1', 'approved', true, true);

  -- the booking, in memory only
  b := jsonb_populate_record(null::public.bookings, jsonb_build_object(
         'id', gen_random_uuid(), 'company_id', c, 'kind', 'transfer', 'status', 'pending',
         'date_display', '2026-11-06T06:00:00.000Z', 'from_location', 'Tbilisi airport', 'to_location', 'Kazbegi',
         'price_gel', 150, 'vehicle_type', 'minivan', 'vehicle_class', 'economy', 'requested_capacity_tier', 'minivan_3_5',
         'passengers', 5, 'voucher_code', head));

  m := public.admin_booking_feed_message(b, 'created');
  insert into _smoke (check_name, ok) values ('created: code, company, route, Tbilisi time, car and seats, passengers, price',
    m ->> 'title' = 'KEKE · ახალი ჯავშანი'
    and m ->> 'body' = head || ' · AF smoke tours · ' || tail || ' · მინივენი ეკონომი (3–5 ადგ.) · 5 მგზ. · 150 ₾'
    and m -> 'data' = jsonb_build_object('booking_id', b.id::text, 'event', 'created', 'code', head));

  b.status := 'accepted'; b.driver_id := d1; b.vehicle_id := car; b.driver_display_name := 'AF smoke driver 1';
  m := public.admin_booking_feed_message(b, 'taken', null);
  insert into _smoke (check_name, ok) values ('taken: who, with which car',
    m ->> 'title' = 'KEKE · ჯავშანი აიღეს'
    and m ->> 'body' = head || ' · AF smoke driver 1 (AF smoke AFSMOKE-1) · ' || tail || ' · 150 ₾');

  b.driver_id := d2; b.vehicle_id := null; b.driver_display_name := 'AF smoke driver 2';
  m := public.admin_booking_feed_message(b, 'taken', d1);
  insert into _smoke (check_name, ok) values ('given to another driver: who has it now and who had it',
    m ->> 'body' = head || ' · AF smoke driver 2 · ადრე: AF smoke driver 1 · ' || tail || ' · 150 ₾');

  b.status := 'pending'; b.driver_id := null; b.driver_display_name := null;
  m := public.admin_booking_feed_message(b, 'reopened', d2);
  insert into _smoke (check_name, ok) values ('open again: who had it',
    m ->> 'title' = 'KEKE · ჯავშანი ისევ ღიაა'
    and m ->> 'body' = head || ' · AF smoke driver 2 აღარ არის · AF smoke tours · ' || tail);

  b.status := 'cancelled'; b.cancelled_by := 'company';
  m := public.admin_booking_feed_message(b, 'cancelled', null);
  insert into _smoke (check_name, ok) values ('cancelled: by whom',
    m ->> 'title' = 'KEKE · ჯავშანი გაუქმდა'
    and m ->> 'body' = head || ' · გააუქმა კომპანიამ (AF smoke tours) · AF smoke tours · ' || tail);

  b.status := 'rejected'; b.cancelled_by := null;
  m := public.admin_booking_feed_message(b, 'rejected', null);
  insert into _smoke (check_name, ok) values ('rejected',
    m ->> 'title' = 'KEKE · ჯავშანი უარყოფილია' and m ->> 'body' = head || ' · AF smoke tours · ' || tail);

  insert into _smoke (check_name, ok) values
    ('the trigger is on the bookings and switched on',
       (select pg_get_triggerdef(t.oid) = 'CREATE TRIGGER bookings_admin_feed AFTER INSERT OR UPDATE OF status, driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION bookings_admin_feed()'
               and t.tgenabled = 'O'
          from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed')),
    ('the admins who will hear it can be reached (phone or browser)',
       exists (select 1 from public.users u where u.role = 'admin')
       and not exists (select 1 from public.users u where u.role = 'admin'
                        and public.fetch_user_push_token(u.id) is null
                        and not exists (select 1 from public.web_push_subscriptions w where w.user_id = u.id))),
    ('the apps cannot run the feed',
       not has_function_privilege('authenticated', 'public.admin_booking_feed_message(public.bookings,text,uuid)', 'execute')
       and not has_function_privilege('anon', 'public.admin_booking_feed_message(public.bookings,text,uuid)', 'execute')
       and not has_function_privilege('authenticated', 'public.bookings_admin_feed()', 'execute')
       and not has_function_privilege('anon', 'public.bookings_admin_feed()', 'execute'));

  if to_regclass('net.http_request_queue') is not null then
    execute 'select count(*) from net.http_request_queue' into queue_after;
  end if;
  insert into _smoke (check_name, ok) values
    ('nothing was notified in this test',
       (select count(*) from public.notifications) = notices_before
       and (select count(*) from public.push_outbox) = outbox_before),
    ('nothing was queued to be sent', queue_after = queue_before);
end
$smoke$;

select n, check_name, ok from _smoke order by n;
select case when bool_and(ok) and count(*) = 11 then 'ALL SMOKE CHECKS PASSED (11)'
            else 'SMOKE FAILED: ' || coalesce(string_agg(check_name, '; ') filter (where not ok), 'wrong number of checks') end as result
  from _smoke;
rollback;

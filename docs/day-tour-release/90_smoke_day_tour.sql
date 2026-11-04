-- KEKE day-tour fix - smoke test with a throwaway company.
--
-- Run after 10_apply_bookings_kind_day_tour.sql. The company creates a day tour
-- the way the app does (role "authenticated" + its JWT claims, as PostgREST
-- does), and the checks read what drivers and reminders would see.
--
-- Everything happens inside ONE transaction that is ROLLED BACK at the end:
-- no account, booking, email or push survives, and nothing is sent (pg_net
-- sends only what is committed; nothing here calls it). No real booking is read
-- or changed. The result rows are the only output.
begin;

create temp table _smoke (n serial, check_name text, ok boolean, detail text);

do $smoke$
declare
  c  uuid := gen_random_uuid();
  b  uuid := gen_random_uuid();
  s  text;
  v  text;
  w  interval;
begin
  insert into auth.users (id, email) values (c, 'day-tour-smoke@kekemanager.com');
  insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
  values (c, 'company', 'Day tour smoke', 'Day tour smoke tours', 'day-tour-smoke@kekemanager.com', true, 'approved', true)
  -- production makes the profile row itself when the account is created (handle_new_user)
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, company_name = excluded.company_name,
    email = excluded.email, is_verified = excluded.is_verified, verification_status = excluded.verification_status,
    is_available = excluded.is_available;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.bookings (id, company_id, kind, booking_type, status, date_display, pickup_time, from_location, to_location,
                                 passengers, vehicle_type, vehicle_class, price_gel, voucher_code)
    values (b, c, 'day_tour', 'day_tour', 'pending', (now() + interval '40 days')::text, '09:00', 'Day tour smoke A', 'Day tour smoke B',
            3, 'sedan', 'comfort', 300, 'DT-SMOKE-1');
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('a company creates a day tour as a day tour', s = 'inserted', s);

  select kind || '/' || booking_type into v from public.bookings where id = b;
  insert into _smoke (check_name, ok, detail) values ('stored with kind and type day_tour', v = 'day_tour/day_tour', coalesce(v, 'no row'));
  select public.booking_type_label_ka(kind, booking_type, flight_direction) into v from public.bookings where id = b;
  insert into _smoke (check_name, ok, detail) values ('reminders call it a day tour', v = 'ერთდღიანი ტური', coalesce(v, 'no row'));
  select public.booking_dispatch_message(b) ->> 'title' into v;
  insert into _smoke (check_name, ok, detail) values ('drivers would be offered a day tour', v = 'KEKE · ახალი დღის ტური!', coalesce(v, 'no message'));
  select win_end - win_start into w from public.booking_busy_window(b);
  insert into _smoke (check_name, ok, detail) values ('the driver is busy for one working day', w = interval '8 hours', coalesce(w::text, 'no window'));
end
$smoke$;

select check_name, case when ok then 'PASS' else 'FAIL' end as result, detail
  from _smoke order by n;

rollback;

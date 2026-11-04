-- KEKE import release - smoke test of the import-approval check, with throwaway accounts.
--
-- Run after 10_apply_import_approvals.sql. It creates its own two companies and
-- their approvals with fresh random ids, plays the app's part as the company
-- (role "authenticated" + its JWT claims, as PostgREST does), and checks that a
-- booking gets in only with exactly the approved values, once - and that a
-- booking typed into the form gets in as before.
--
-- Everything happens inside ONE transaction that is ROLLED BACK at the end:
-- no account, booking, approval, email or push survives, and nothing is sent
-- (pg_net sends only what is committed). The result rows are the only output.
begin;

create temp table _smoke (n serial, check_name text, ok boolean, detail text);

do $smoke$
declare
  c   uuid := gen_random_uuid();  -- company
  c2  uuid := gen_random_uuid();  -- another company
  a1  uuid := gen_random_uuid();  -- approval: the right values
  a2  uuid := gen_random_uuid();  -- approval: the booking will differ
  a3  uuid := gen_random_uuid();  -- approval of the other company
  a4  uuid := gen_random_uuid();  -- approval that has expired
  b_ok   uuid := gen_random_uuid();
  b_form uuid := gen_random_uuid();
  d   text := (now() + interval '40 days')::text;
  ok_values jsonb;
  s text;
  n int;
begin
  insert into auth.users (id, email)
  values (c, 'import-smoke-company@kekemanager.com'), (c2, 'import-smoke-company2@kekemanager.com');
  insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
  values (c,  'company', 'Import smoke company',   'Import smoke tours',   'import-smoke-company@kekemanager.com',  true, 'approved', true),
         (c2, 'company', 'Import smoke company 2', 'Import smoke tours 2', 'import-smoke-company2@kekemanager.com', true, 'approved', true)
  -- production makes the profile row itself when the account is created (handle_new_user)
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, company_name = excluded.company_name,
    email = excluded.email, is_verified = excluded.is_verified, verification_status = excluded.verification_status,
    is_available = excluded.is_available;

  -- what the server approves (the function writes these with the service role)
  ok_values := jsonb_build_object('date_display', d, 'pickup_time', '10:00', 'passengers', 2, 'vehicle_type', 'sedan',
                                  'price_gel', 100, 'client_price', 100, 'flight_number', 'TK 383',
                                  'from_location', 'Import smoke A', 'to_location', 'Import smoke B');
  insert into public.booking_import_approvals (id, company_id, approved) values (a1, c, ok_values), (a2, c, ok_values), (a3, c2, ok_values);
  insert into public.booking_import_approvals (id, company_id, approved, expires_at) values (a4, c, ok_values, now() - interval '1 minute');

  -- the app, as the company
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, flight_number, voucher_code, import_approval_id)
    values (gen_random_uuid(), c, 'transfer', 'pending', d, '10:00', 'Import smoke A', 'Import smoke B',
            100, 100, 'sedan', 'comfort', 2, 'TK 383', 'IMP-SMOKE-1', gen_random_uuid());
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('an approval that does not exist is refused', s like 'refused (42501)%not found%', s);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, flight_number, voucher_code, import_approval_id)
    values (b_ok, c, 'transfer', 'pending', d, '10:00', 'Import smoke A', 'Import smoke B',
            100, 100, 'sedan', 'comfort', 2, 'TK383', 'IMP-SMOKE-2', a1);
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('the approved values get in (flight written without the space)', s = 'inserted', s);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, flight_number, voucher_code, import_approval_id)
    values (gen_random_uuid(), c, 'transfer', 'pending', d, '10:00', 'Import smoke A', 'Import smoke B',
            100, 100, 'sedan', 'comfort', 2, 'TK 383', 'IMP-SMOKE-3', a1);
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('one approval makes one booking', s like 'refused (42501)%already used%', s);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, flight_number, voucher_code, import_approval_id)
    values (gen_random_uuid(), c, 'transfer', 'pending', d, '10:00', 'Import smoke A', 'Import smoke B',
            100, 100, 'sedan', 'comfort', 3, 'TK 383', 'IMP-SMOKE-4', a2);
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('a value changed after approval is refused', s like 'refused (42501)%passengers%', s);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, flight_number, voucher_code, import_approval_id)
    values (gen_random_uuid(), c, 'transfer', 'pending', d, '10:00', 'Import smoke A', 'Import smoke B',
            100, 100, 'sedan', 'comfort', 2, 'TK 383', 'IMP-SMOKE-5', a3);
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('another company''s approval is refused', s like 'refused (42501)%' and s not like '%row-level security%' and s like '%another company%', s);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, flight_number, voucher_code, import_approval_id)
    values (gen_random_uuid(), c, 'transfer', 'pending', d, '10:00', 'Import smoke A', 'Import smoke B',
            100, 100, 'sedan', 'comfort', 2, 'TK 383', 'IMP-SMOKE-6', a4);
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('an expired approval is refused', s like 'refused (42501)%expired%', s);
  execute 'set local role authenticated';

  begin
    insert into public.bookings (id, company_id, kind, status, date_display, pickup_time, from_location, to_location,
                                 price_gel, client_price, vehicle_type, vehicle_class, passengers, voucher_code)
    values (b_form, c, 'transfer', 'pending', d, '11:00', 'Import smoke C', 'Import smoke D',
            50, 50, 'minivan', 'comfort', 4, 'IMP-SMOKE-7');
    s := 'inserted';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('a booking typed into the form gets in as before', s = 'inserted', s);
  execute 'set local role authenticated';

  begin
    update public.bookings set import_approval_id = a2 where id = b_form;
    get diagnostics n = row_count; s := n || ' rows';
  exception when others then s := 'refused (' || sqlstate || ') ' || sqlerrm; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('an approval cannot be attached to a booking later', s like 'refused (42501)%', s);
  execute 'set local role authenticated';

  begin
    select count(*) into n from public.booking_import_approvals;
    s := n || ' rows visible';
  exception when others then s := 'refused (' || sqlstate || ')'; end;
  execute 'reset role';
  insert into _smoke (check_name, ok, detail) values ('the app cannot read the approvals', s = 'refused (42501)', s);

  -- as the database owner from here on
  select count(*) into n from public.booking_import_approvals where id = a1 and used_at is not null and used_booking_id = b_ok;
  insert into _smoke (check_name, ok, detail) values ('the approval names the booking it made', n = 1, n || ' row');
  select count(*) into n from public.booking_import_approvals where id in (a2, a3, a4) and used_at is null;
  insert into _smoke (check_name, ok, detail) values ('a refused booking does not use up its approval', n = 3, n || ' of 3 unused');
end
$smoke$;

select check_name, case when ok then 'PASS' else 'FAIL' end as result, detail
  from _smoke order by n;

rollback;

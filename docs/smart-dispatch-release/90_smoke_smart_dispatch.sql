-- KEKE smart dispatch - smoke test with throwaway accounts, after 10_apply_smart_dispatch.sql.
--
-- A company and three drivers that exist only inside this transaction - an
-- economy, a comfort and a VIP minivan of 3-5 seats, all speaking English - and
-- the 5 Nov case: an economy 3-5 seat minivan job in English. Every app read is
-- made the way the apps make it (role "authenticated" + its JWT claims, as
-- PostgREST does).
--
-- Nothing is pushed or notified: no function that notifies anyone is called,
-- and everything happens inside ONE transaction that is ROLLED BACK at the end.
-- No real row is read or changed. Every "ok" must be true.
begin;

create temp table _smoke (n serial, check_name text, ok boolean);
grant all on _smoke to authenticated;
grant usage, select on sequence _smoke_n_seq to authenticated;

do $smoke$
declare
  c  uuid := gen_random_uuid();   -- company
  e  uuid := gen_random_uuid();   -- economy minivan 3-5
  cm uuid := gen_random_uuid();   -- comfort minivan 3-5
  v  uuid := gen_random_uuid();   -- VIP minivan 3-5
  b  uuid := gen_random_uuid();   -- the job
  start text := to_char((now() + interval '2 days') at time zone 'UTC', 'YYYY-MM-DD"T"06:00:00.000"Z"');
  refused boolean;
begin
  insert into auth.users (id, email) values
    (c, 'sd-smoke-company@kekemanager.com'), (e, 'sd-smoke-economy@kekemanager.com'),
    (cm, 'sd-smoke-comfort@kekemanager.com'), (v, 'sd-smoke-vip@kekemanager.com');
  insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_blocked,
                            is_available, is_hired_driver, available_for_hire, city, languages)
  values (c,  'company', 'SD smoke company', 'SD smoke tours', 'sd-smoke-company@kekemanager.com', true, 'approved', false, true, false, false, 'Tbilisi', null),
         (e,  'driver', 'SD smoke economy', null, 'sd-smoke-economy@kekemanager.com', true, 'approved', false, true, false, true, 'Tbilisi', array['en']),
         (cm, 'driver', 'SD smoke comfort', null, 'sd-smoke-comfort@kekemanager.com', true, 'approved', false, true, false, true, 'Tbilisi', array['en']),
         (v,  'driver', 'SD smoke VIP', null, 'sd-smoke-vip@kekemanager.com', true, 'approved', false, true, false, true, 'Tbilisi', array['en'])
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, company_name = excluded.company_name,
    email = excluded.email, is_verified = excluded.is_verified, verification_status = excluded.verification_status,
    is_blocked = excluded.is_blocked, is_available = excluded.is_available, is_hired_driver = excluded.is_hired_driver,
    available_for_hire = excluded.available_for_hire, city = excluded.city, languages = excluded.languages;
  insert into public.vehicles (id, driver_id, type, class, capacity_tier, model, plate, verification_status, is_verified, is_active)
  values (gen_random_uuid(), e,  'minivan', 'economy', 'minivan_3_5', 'SD smoke', 'SDSMOKE-E', 'approved', true, true),
         (gen_random_uuid(), cm, 'minivan', 'comfort', 'minivan_3_5', 'SD smoke', 'SDSMOKE-C', 'approved', true, true),
         (gen_random_uuid(), v,  'minivan', 'vip',     'minivan_3_5', 'SD smoke', 'SDSMOKE-V', 'approved', true, true);
  insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                               vehicle_type, vehicle_class, requested_capacity_tier, required_languages, passengers, voucher_code)
  values (b, c, 'transfer', 'pending', start, 'Tbilisi airport', 'Tbilisi hotel', 150,
          'minivan', 'economy', 'minivan_3_5', array['en'], 5, 'SD-SMOKE-1');

  insert into _smoke (check_name, ok) values
    ('the three drivers may take jobs', public.driver_can_take_jobs(e) and public.driver_can_take_jobs(cm) and public.driver_can_take_jobs(v)),
    ('waves 1-2: the economy car is an exact match', exists (select 1 from public.booking_dispatch_pool(b, false, e))),
    ('waves 1-2: the comfort car is not', not exists (select 1 from public.booking_dispatch_pool(b, false, cm))),
    ('wave 3: the comfort car joins', exists (select 1 from public.booking_dispatch_pool(b, true, cm))),
    ('never: the VIP car, not even in wave 3', not exists (select 1 from public.booking_dispatch_pool(b, true, v))),
    ('the exact set (what the installed apps'' second wave reads) has the economy car and not the comfort or VIP one',
       exists (select 1 from public.booking_dispatch_candidates(b) x where x.candidate_id = e)
       and not exists (select 1 from public.booking_dispatch_candidates(b) x where x.candidate_id in (cm, v))),
    ('the push shows the start in Tbilisi time',
       public.booking_start_label_ka('2026-11-06T06:00:00.000Z') = '6 ნოემბერი, 10:00'),
    ('the push text carries that time',
       position(public.booking_start_label_ka(start) in coalesce(public.booking_dispatch_message(b)::text, '')) > 0);

  perform public.booking_dispatch_launch(b);
  insert into _smoke (check_name, ok) values
    ('a launch starts the clock, wave 3 due ten minutes on',
       (select dispatch_launched_at = now() and dispatch_wave3_due_at = now() + interval '10 minutes' and dispatch_wave3_sent_at is null
          from public.bookings where id = b));

  -- the open-jobs lists, as each driver's app reads them
  perform set_config('request.jwt.claims', json_build_object('sub', e, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('open jobs: the economy driver sees it at once',
    exists (select 1 from jsonb_array_elements(public.driver_matching_open_jobs()) j where j ->> 'id' = b::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', cm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('open jobs: the comfort driver does not see it before wave 3',
    not exists (select 1 from jsonb_array_elements(public.driver_matching_open_jobs()) j where j ->> 'id' = b::text));
  execute 'reset role';

  update public.bookings set dispatch_wave3_due_at = null, dispatch_wave3_sent_at = now() where id = b;  -- as if wave 3 went out
  perform set_config('request.jwt.claims', json_build_object('sub', cm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('open jobs: the comfort driver sees it after wave 3',
    exists (select 1 from jsonb_array_elements(public.driver_matching_open_jobs()) j where j ->> 'id' = b::text));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', v, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('open jobs: the VIP driver never sees it',
    not exists (select 1 from jsonb_array_elements(public.driver_matching_open_jobs()) j where j ->> 'id' = b::text));
  execute 'reset role';

  -- the company cannot write the server's dispatch columns
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.bookings set dispatch_launched_at = now() - interval '1 day' where id = b;
    refused := false;
  exception when others then
    refused := true;
  end;
  execute 'reset role';
  insert into _smoke (check_name, ok) values ('a company''s write to the launch time is refused', refused);

  insert into _smoke (check_name, ok) values
    ('signed-out callers cannot read open jobs', not has_function_privilege('anon', 'public.driver_matching_open_jobs(uuid)', 'execute')),
    ('the apps cannot run the dispatch itself', not has_function_privilege('authenticated', 'public.dispatch_new_booking_push(uuid,integer)', 'execute')
                                                 and not has_function_privilege('authenticated', 'public.dispatch_due_third_waves()', 'execute')),
    ('nothing was notified in this test', not exists (select 1 from public.notifications where user_id in (c, e, cm, v)));
end
$smoke$;

select n, check_name, ok from _smoke order by n;
select case when bool_and(ok) and count(*) = 17 then 'ALL SMOKE CHECKS PASSED (17)'
            else 'SMOKE FAILED: ' || coalesce(string_agg(check_name, '; ') filter (where not ok), 'wrong number of checks') end as result
  from _smoke;
rollback;

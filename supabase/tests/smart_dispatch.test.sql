-- Smart dispatch (20261105120000_smart_dispatch.sql): who hears about a new
-- booking in which wave, what the open-jobs list shows each driver, the admin
-- alert after a launch, and the push text. One transaction, rolled back;
-- nothing leaves the machine (net.http_post is the shim's recorder).
-- Seed: fixtures/smart_dispatch_seed.sql (the drivers and jobs are described there).
begin;
select * from no_plan();
\ir fixtures/smart_dispatch_seed.sql

-- helpers ---------------------------------------------------------------------

create or replace function tests.sd_bnames() returns text[]
language sql immutable as $$
  select array['ECO','ECO_ANY','ECO68','COMF','VIP','MB13','MB13X','GUIDE','OFFER','FMT','APP',
               'OLD','NEWB','TAKEN','STALE','LATE','MASTER']
$$;
create or replace function tests.sd_bname(p_id uuid) returns text
language sql stable as $$
  select n from unnest(tests.sd_bnames()) n where tests.sd(n) = p_id
$$;
-- the exact matches (the one-argument function every old caller uses)
create or replace function tests.sd_exact(p_booking text) returns text
language sql security definer set search_path = public as $$
  select tests.sd_names(array_agg(c.candidate_id)) from public.booking_dispatch_candidates(tests.sd(p_booking)) c
$$;
create or replace function tests.sd_local(p_booking text) returns text
language sql security definer set search_path = public as $$
  select tests.sd_names(array_agg(c.candidate_id) filter (where c.is_local))
    from public.booking_dispatch_candidates(tests.sd(p_booking)) c
$$;
create or replace function tests.sd_pool(p_booking text, p_widened boolean) returns text
language sql security definer set search_path = public as $$
  select tests.sd_names(array_agg(c.candidate_id))
    from public.booking_dispatch_pool(tests.sd(p_booking), p_widened, null) c
$$;
-- the open-jobs list as the driver's app gets it
create or replace function tests.sd_sees(p_driver text, p_booking text default null) returns text
language plpgsql as $$
declare
  jobs jsonb;
begin
  perform tests.act_as(tests.sd(p_driver));
  jobs := public.driver_matching_open_jobs(case when p_booking is null then null else tests.sd(p_booking) end);
  perform tests.act_as_owner();
  return coalesce((select string_agg(tests.sd_bname((j ->> 'id')::uuid), ',' order by tests.sd_bname((j ->> 'id')::uuid))
                     from jsonb_array_elements(jobs) j), '');
end;
$$;
-- what the push logic allows him now: offers to him by name, and open jobs
-- whose pool (exact, or widened once the third wave went out) has him
create or replace function tests.sd_allowed(p_driver text) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(tests.sd_bname(b.id), ',' order by tests.sd_bname(b.id)), '')
    from public.bookings b
   where b.status = 'pending'
     and not coalesce(b.is_group_master, false)
     and public.driver_can_take_jobs(tests.sd(p_driver))
     and (b.driver_id = tests.sd(p_driver)
          or (b.driver_id is null
              and tests.sd(p_driver) in (
                select c.candidate_id
                  from public.booking_dispatch_pool(b.id, b.dispatch_wave3_sent_at is not null, null) c)))
$$;
-- every driver whose list differs from what the push logic allows (empty: none)
create or replace function tests.sd_list_mismatches() returns text
language plpgsql as $$
declare
  n   text;
  bad text[] := '{}';
  s   text;
  a   text;
begin
  foreach n in array tests.sd_drivers() loop
    s := tests.sd_sees(n);
    a := tests.sd_allowed(n);
    if s is distinct from a then
      bad := bad || (n || ' sees [' || s || '] but may see [' || a || ']');
    end if;
  end loop;
  return array_to_string(bad, '; ');
end;
$$;
-- the drivers who see one job in their list
create or replace function tests.sd_who_sees(p_booking text) returns text
language plpgsql as $$
declare
  n   text;
  who text[] := '{}';
begin
  foreach n in array tests.sd_drivers() loop
    if tests.sd_sees(n, p_booking) <> '' then
      who := who || n;
    end if;
  end loop;
  return coalesce((select string_agg(x, ',' order by x) from unnest(who) x), '');
end;
$$;
create or replace function tests.sd_col(p_booking text, p_col text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  execute format('select %I from public.bookings where id = $1', p_col) into v using tests.sd(p_booking);
  return v;
end;
$$;
create or replace function tests.sd_pushes(p_name text) returns int
language sql security definer set search_path = public, net as $$
  select count(*)::int from net.http_calls c
   where c.url like 'https://exp.host/%' and c.body ->> 'to' = tests.sd_tok(p_name)
$$;
grant execute on all functions in schema tests to public;

-- 1. What the migration adds ------------------------------------------------------

select has_column('public', 'bookings', 'dispatch_launched_at', 'M1 bookings.dispatch_launched_at');
select has_column('public', 'bookings', 'dispatch_wave3_due_at', 'M2 bookings.dispatch_wave3_due_at');
select has_column('public', 'bookings', 'dispatch_wave3_sent_at', 'M3 bookings.dispatch_wave3_sent_at');
select col_type_is('public', 'bookings', 'dispatch_wave3_due_at', 'timestamp with time zone', 'M4 the wave times are timestamptz');
select has_column('public', 'dispatch_log', 'wave3_driver_ids', 'M5 dispatch_log.wave3_driver_ids');
select has_column('public', 'dispatch_log', 'wave3_token_count', 'M6 dispatch_log.wave3_token_count');
select is((select count(*)::int from public.bookings
            where dispatch_launched_at is not null or dispatch_wave3_due_at is not null or dispatch_wave3_sent_at is not null),
  0, 'M7 no existing booking is given a launch or a third wave');

select ok(has_function_privilege('authenticated', 'public.driver_matching_open_jobs(uuid)', 'EXECUTE'),
  'M8 a signed-in user may call driver_matching_open_jobs');
select ok(not has_function_privilege('anon', 'public.driver_matching_open_jobs(uuid)', 'EXECUTE'),
  'M9 anon may not');
select is((select string_agg(f, ',' order by f) from unnest(array[
    'public.booking_dispatch_pool(uuid,boolean,uuid)', 'public.booking_dispatch_candidates(uuid)',
    'public.dispatch_due_third_waves()', 'public.dispatch_due_second_waves()', 'public.booking_dispatch_launch(uuid)',
    'public.booking_start_label_ka(text)', 'public.capacity_tier_max_seats(text)', 'public.alert_undispatched_bookings()',
    'public.dispatch_new_booking_push(uuid,integer)', 'public.booking_dispatch_message(uuid)']) f
   where has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE')
      or (select proacl from pg_proc where oid = f::regprocedure) is null
      or exists (select 1 from aclexplode((select proacl from pg_proc where oid = f::regprocedure)) a where a.grantee = 0)),
  null, 'M10 the server''s own functions answer neither signed-in users, nor anon, nor PUBLIC');
select ok(has_function_privilege('service_role', 'public.dispatch_due_third_waves()', 'EXECUTE')
          and has_function_privilege('service_role', 'public.booking_dispatch_pool(uuid,boolean,uuid)', 'EXECUTE'),
  'M11 the server (service_role) may call them');

-- the new columns are the server's: a company's direct write is refused
select tests.act_as(tests.sd('C1'));
select is(tests.sqlstate_of(format('update public.bookings set dispatch_wave3_sent_at = now() where id = %L', tests.sd('ECO'))),
  '42501', 'M12 a company cannot show its job to the widened drivers early');
select is(tests.sqlstate_of(format('update public.bookings set dispatch_wave3_due_at = now() where id = %L', tests.sd('ECO'))),
  '42501', 'M13 a company cannot bring the widening wave forward');
select is(tests.sqlstate_of(format('update public.bookings set dispatch_launched_at = now() + interval ''1 day'' where id = %L', tests.sd('ECO'))),
  '42501', 'M14 a company cannot move its launch (and so the admin''s alert)');
select is(tests.sqlstate_of(format(
    'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, price_gel, vehicle_type, vehicle_class, passengers, voucher_code, dispatch_wave3_sent_at)
     values (%L, ''transfer'', ''pending'', %L, ''Tbilisi airport'', ''Tbilisi hotel'', 100, ''minivan'', ''economy'', 2, ''SD-INS'', now())',
    tests.sd('C1'), tests.sd_start())),
  '42501', 'M15 a new booking cannot arrive already widened');
select is(tests.sqlstate_of(format('update public.bookings set price_gel = 160 where id = %L', tests.sd('ECO'))),
  'ok', 'M16 the company still edits its own booking as before');
select tests.act_as_owner();
update public.bookings set price_gel = 150 where id = tests.sd('ECO');

-- 2. The rules: exact matches, and the widening wave's set ------------------------

-- the 5 Nov job: economy minivan 3-5, English, 5 passengers
select is(tests.sd_exact('ECO'), 'E_FAR,E_LOC,G_ECO,HOST,SUB',
  'R1 an economy 3-5 English job: economy 3-5 cars whose drivers list English (fleet driver SUB on HOST''s car too)');
select is(tests.sd_pool('ECO', false), tests.sd_exact('ECO'),
  'R2 booking_dispatch_candidates(uuid) is the pool without widening');
select is(tests.sd_local('ECO'), 'E_LOC,G_ECO,HOST,SUB', 'R3 is_local as before: those working in Tbilisi');
select is(tests.sd_pool('ECO', true), 'C_FAR,C_LOC,E_BIG,E_FAR,E_LOC,E_NOL,E_NUL,G_ECO,HOST,SUB,W_ALL',
  'R4 widened: + comfort cars, the 6-8 seat minivan, drivers who list no language (and W_ALL, all three at once)');
select ok(position('V_LOC' in tests.sd_pool('ECO', true)) = 0 and position('B_LOC' in tests.sd_pool('ECO', true)) = 0,
  'R5 never a VIP or business car for an economy job, not even widened');
select ok(position('E_RU' in tests.sd_pool('ECO', true)) = 0,
  'R6 a driver whose languages leave English out is not widened in');
select ok(tests.sd_pool('ECO', true) !~ '(E_DEC|C_DEC|E_BSY|C_BSY|E_UNA|E_BLK|E_OFF|E_CUA|HIRED)',
  'R7 widened or not: no decliner, no closed calendar, nobody who may not take jobs, no hired driver');

select is(tests.sd_exact('ECO_ANY'), 'E_BIG,E_DEC,E_FAR,E_LOC,E_NOL,E_NUL,E_RU,G_ECO,HOST,SUB',
  'R8 no tier and no language asked: any economy minivan, as before');
select is(tests.sd_pool('ECO_ANY', true), 'C_DEC,C_FAR,C_LOC,E_BIG,E_DEC,E_FAR,E_LOC,E_NOL,E_NUL,E_RU,G_ECO,HOST,SUB,W_ALL',
  'R9 widened: + the comfort minivans (C_DEC declined only ECO)');

select is(tests.sd_exact('ECO68'), 'E_BIG', 'R10 a 6-8 seat job: 6-8 seat cars');
select is(tests.sd_pool('ECO68', true), 'E_BIG,W_ALL', 'R11 widened: the comfort 6-8, never a smaller 3-5 (though it would seat the 4 passengers)');

select is(tests.sd_exact('MB13'), 'MB13', 'R12 a 13-seat microbus job (12 passengers): the 13-seater');
select is(tests.sd_pool('MB13', true), 'MB13,MB16,MB18', 'R13 widened: the bigger microbuses, never the 10-seater');
select is(tests.sd_exact('MB13X'), 'MB13', 'R14 17 passengers on a 13-seat request: the exact wave is still the tier asked for');
select is(tests.sd_pool('MB13X', true), 'MB13,MB18', 'R15 widened: only bigger tiers that seat all 17 (not the 16-seater)');

select is(tests.sd_exact('COMF'), 'B_LOC,C_DEC,C_FAR,C_LOC,V_LOC,W_ALL', 'R16 a comfort job: comfort and higher, as before');
select is(tests.sd_pool('COMF', true), tests.sd_exact('COMF'), 'R17 widening changes nothing for a comfort job');
select is(tests.sd_exact('VIP'), 'V_LOC', 'R18 a VIP job: VIP cars, as before');
select is(tests.sd_pool('VIP', true), 'V_LOC', 'R19 widening changes nothing for a VIP job');
select is(tests.sd_pool('GUIDE', true), 'G_ECO', 'R20 a job asking for a guide stays with guides, widened too');
select is(tests.sd_pool('OFFER', true), 'E_LOC', 'R21 a job offered by name stays his, widened too');
select is(
  (select count(*)::int from unnest(tests.sd_bnames()) b
    where tests.sd(b) in (select id from public.bookings)
      and not (string_to_array(tests.sd_pool(b, false), ',') <@ string_to_array(tests.sd_pool(b, true), ','))),
  0, 'R22 for every job the exact set is inside the widened one');

-- 3. The waves: the server's own (the one-minute fallback / no order from the app) -----

select is(public.dispatch_new_booking_push(tests.sd('ECO'), 1), 4, 'W1 wave 1 tells four drivers');
select is(tests.sd_told('ECO'), 'E_LOC,G_ECO,HOST,SUB', 'W2 the exact matches working where the job starts');
select is(tests.sd_col('ECO', 'dispatch_launched_at'), now(), 'W3 the launch is now');
select is(tests.sd_col('ECO', 'dispatch_wave2_due_at'), now() + interval '3 minutes', 'W4 wave 2 is due in 3 minutes, as before');
select is(tests.sd_col('ECO', 'dispatch_wave3_due_at'), now() + interval '10 minutes', 'W5 wave 3 is due in 10 minutes');
select is(tests.sd_col('ECO', 'dispatch_wave3_sent_at'), null, 'W6 wave 3 has not gone out');
select is(public.dispatch_new_booking_push(tests.sd('ECO'), 3), 0, 'W6a a third wave asked for before it is due tells nobody');
select is(tests.sd_col('ECO', 'dispatch_wave3_due_at'), now() + interval '10 minutes', 'W6b and leaves it due as it was');
select is((select tests.sd_names(wave1_driver_ids) from public.dispatch_log where booking_id = tests.sd('ECO')),
  'E_LOC,G_ECO,HOST,SUB', 'W7 the dispatch log records wave 1');

select tests.sd_advance(3, array['ECO']);
select public.dispatch_due_second_waves();
select is(tests.sd_told('ECO'), 'E_FAR,E_LOC,G_ECO,HOST,SUB', 'W8 at +3 min the other exact match (E_FAR, Batumi) is told');
select is(tests.sd_col('ECO', 'dispatch_wave2_due_at'), null, 'W9 wave 2 is done');
select is(tests.sd_col('ECO', 'dispatch_wave3_due_at'), now() + interval '7 minutes', 'W10 wave 3 still waits');
select is(tests.sd_who_sees('ECO'), tests.sd_told('ECO'),
  'W11 before wave 3, exactly the drivers who were told see the job in their list');
select is(tests.sd_sees('C_LOC', 'ECO'), '', 'W12 the comfort driver does not see it yet');

select tests.sd_advance(6, array['ECO']);
select public.dispatch_due_second_waves();
select is(tests.sd_told('ECO'), 'E_FAR,E_LOC,G_ECO,HOST,SUB', 'W13 at +9 min nobody new is told');

select tests.sd_advance(1, array['ECO']);
select public.dispatch_due_second_waves();
select is(tests.sd_told('ECO'), 'C_FAR,C_LOC,E_BIG,E_FAR,E_LOC,E_NOL,E_NUL,G_ECO,HOST,SUB,W_ALL',
  'W14 at +10 min wave 3 tells the widened set, near and far');
select is((select tests.sd_names(wave3_driver_ids) from public.dispatch_log where booking_id = tests.sd('ECO')),
  'C_FAR,C_LOC,E_BIG,E_NOL,E_NUL,W_ALL', 'W15 the dispatch log records wave 3: only the drivers not told yet');
select is((select wave3_token_count from public.dispatch_log where booking_id = tests.sd('ECO')), 6,
  'W16 ... and how many phones it reached');
select is(tests.sd_col('ECO', 'dispatch_wave3_sent_at'), now(), 'W17 wave 3 went out now');
select is(tests.sd_col('ECO', 'dispatch_wave3_due_at'), null, 'W18 and is no longer due');
select is((select count(*)::int from public.notifications n
            where n.type = 'new_booking' and n.data ->> 'booking_id' = tests.sd('ECO')::text
              and n.user_id in (select tests.sd(x) from unnest(array['V_LOC','B_LOC','E_RU','E_DEC','C_DEC','E_BSY','C_BSY',
                                                                      'E_UNA','E_BLK','E_OFF','E_CUA','HIRED','S_ECO','MB13']) x)),
  0, 'W19 never told: VIP, business, a language left out, decliners, closed calendars, not allowed, hired, other types');
select is((select max(c)::int from (select count(*) c from public.notifications n
            where n.type = 'new_booking' and n.data ->> 'booking_id' = tests.sd('ECO')::text group by n.user_id) x),
  1, 'W20 nobody is told twice');
select is(tests.sd_pushes('C_LOC'), 1, 'W21 the comfort driver''s phone got one push');
select is(tests.sd_who_sees('ECO'), tests.sd_told('ECO'),
  'W22 after wave 3, exactly the drivers who were told see the job in their list');

select tests.sd_advance(5, array['ECO']);
select is(public.dispatch_due_second_waves(), 0, 'W23 the next minutes send nothing more');
select is(public.dispatch_new_booking_push(tests.sd('ECO'), 3), 0, 'W24 a repeated wave 3 tells nobody twice');

-- 4. The waves when the app gives the order (dispatch_new_booking) ------------------

select tests.act_as(tests.sd('C1'));
select is(public.dispatch_new_booking(tests.sd('APP'),
            array[tests.sd('E_LOC'), tests.sd('C_LOC'), tests.sd('V_LOC')],
            array[tests.sd('E_FAR'), tests.sd('E_BIG')]),
  '{"notified": 1, "queued": 1}'::jsonb,
  'A1 the app''s order keeps only exact matches: E_LOC now, E_FAR in three minutes (not C_LOC, V_LOC, E_BIG)');
select tests.act_as_owner();
select is(tests.sd_col('APP', 'dispatch_launched_at'), now(), 'A2 the app''s dispatch is the launch');
select is(tests.sd_col('APP', 'dispatch_wave3_due_at'), now() + interval '10 minutes', 'A3 wave 3 is due in 10 minutes');
select tests.sd_advance(3, array['APP']);
select public.flush_push_outbox();
select is(tests.sd_told('APP'), 'E_FAR,E_LOC', 'A4 at +3 min the queued driver is told');
select tests.sd_advance(7, array['APP']);
select public.dispatch_due_second_waves();
select is(tests.sd_told('APP'), 'C_DEC,C_FAR,C_LOC,E_BIG,E_DEC,E_FAR,E_LOC,E_NOL,E_NUL,G_ECO,HOST,SUB,W_ALL',
  'A5 at +10 min wave 3 tells everyone else in the widened set, the exact matches the app left out too');
select is(tests.sd_notices('V_LOC', 'APP'), 0, 'A6 the VIP car still never hears about it');
select tests.act_as(tests.sd('C1'));
select is(public.dispatch_new_booking(tests.sd('APP'), array[tests.sd('E_LOC')], null),
  '{"notified": 0, "queued": 0}'::jsonb, 'A7 asking again tells nobody twice and is not a new launch');
select tests.act_as_owner();
select is(tests.sd_col('APP', 'dispatch_wave3_sent_at'), now(), 'A8 the third wave stays sent');

-- 5. The open-jobs list: one rule with the pushes ----------------------------------------

select is(tests.sd_list_mismatches(), '', 'L1 every driver''s list is exactly what the push logic allows him now');
select is(tests.sd_sees('E_LOC'), 'APP,ECO,ECO_ANY,OFFER', 'L2 E_LOC: the economy jobs he matches and the job offered to him');
select is(tests.sd_sees('E_FAR'), 'APP,ECO,ECO_ANY', 'L3 E_FAR: not E_LOC''s offer');
select is(tests.sd_sees('C_LOC'), 'APP,COMF,ECO', 'L4 C_LOC: the comfort job, and the economy jobs whose third wave went out');
select is(tests.sd_sees('C_FAR'), 'APP,COMF,ECO', 'L5 C_FAR: the same, wherever he works');
select is(tests.sd_sees('V_LOC'), 'COMF,VIP', 'L6 V_LOC: comfort and VIP jobs, never an economy one');
select is(tests.sd_sees('E_BIG'), 'APP,ECO,ECO68,ECO_ANY', 'L7 E_BIG: his 6-8 job, any-size jobs, and 3-5 jobs once widened');
select is(tests.sd_sees('E_NOL'), 'APP,ECO,ECO_ANY', 'L8 E_NOL (no language): English jobs once widened');
select is(tests.sd_sees('E_RU'), 'ECO_ANY', 'L9 E_RU: no English job, ever');
select is(tests.sd_sees('E_DEC'), 'APP,ECO_ANY', 'L10 E_DEC: not the job he declined');
select is(tests.sd_sees('E_BSY'), '', 'L11 E_BSY: nothing while his calendar is closed');
select is(tests.sd_sees('SUB'), 'APP,ECO,ECO_ANY', 'L12 SUB, the fleet driver: the jobs for the car his owner gave him');
select is(tests.sd_sees('MB16'), '', 'L13 MB16: not the 13-seat job while its third wave has not gone out');
select is(tests.sd_sees('G_ECO'), 'APP,ECO,ECO_ANY,GUIDE', 'L14 G_ECO: the guide job too');
select is(tests.sd_sees('E_UNA'), '', 'L15 a driver KEKE has not approved sees nothing');
select is(tests.sd_sees('E_OFF'), '', 'L16 a driver whose car is switched off sees nothing');
select is(tests.sd_sees('HIRED'), '', 'L17 a hired driver sees no open job');
select tests.act_as(tests.sd('C1'));
select is(public.driver_matching_open_jobs(), '[]'::jsonb, 'L18 a company gets nothing');
select tests.act_as_anon();
select is(tests.try_value('select public.driver_matching_open_jobs()::text'), 'denied', 'L19 anon cannot call it');
select tests.act_as_owner();
select is(tests.sd_sees('C_LOC', 'ECO'), 'ECO', 'L20 one job: ECO for C_LOC now that its third wave went out');
select is(tests.sd_sees('C_LOC', 'ECO_ANY'), '', 'L21 one job: ECO_ANY not yet for C_LOC');

select tests.act_as(tests.sd('E_LOC'));
select is((select count(*)::int from jsonb_array_elements(public.driver_matching_open_jobs()) j
            where j ?| array['passenger_name', 'passenger_phone', 'meet_phone', 'sign_text', 'client_price', 'commission',
                             'voucher_code', 'comment', 'flight_number']),
  0, 'L22 summaries only: no passenger, contact, sign, notes, client price, commission or voucher');
select ok((select bool_and(j ? 'vehicle_class' and j ? 'date_display' and j ? 'price_gel')
             from jsonb_array_elements(public.driver_matching_open_jobs()) j),
  'L23 ... with what the list shows (class, date, the company''s price)');
select ok((select bool_and(public.driver_open_jobs(tests.sd(tests.sd_bname((j ->> 'id')::uuid))) @> jsonb_build_array(j))
             from jsonb_array_elements(public.driver_matching_open_jobs()) j),
  'L24 each job is the same summary driver_open_jobs gives');
select tests.act_as_owner();

-- the comfort driver after the economy job's widening: L4 above; before it, nothing:
select is(tests.sd_sees('C_LOC', 'ECO_ANY'), '', 'L25 an economy job not yet widened stays out of the comfort driver''s list');
select public.dispatch_new_booking_push(tests.sd('ECO_ANY'), 1);
select tests.sd_advance(10, array['ECO_ANY']);
select public.dispatch_due_second_waves();
select is(tests.sd_sees('C_LOC', 'ECO_ANY'), 'ECO_ANY', 'L26 ... and comes in when its third wave goes out');
select is(tests.sd_list_mismatches(), '', 'L27 every list still matches the push logic');

-- 6. A launch: new bookings, and bookings put back up ------------------------------------

-- a booking put back up long after it was created, as on 5 Nov: a driver had
-- taken it three days ago; the admin sets it back to pending (first dispatch
-- time = now) and runs the server's first wave
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code,
                             created_at, dispatch_fallback_sent_at, dispatch_alert_sent_at)
values (tests.sd('OLD'), tests.sd('C1'), tests.sd('S_ECO'), 'transfer', 'accepted', tests.sd_start(), 'Tbilisi airport',
        'Tbilisi hotel', 90, 'bus', 'economy', 30, 'SD-OLD',
        now() - interval '3 days', now() - interval '3 days', now() - interval '3 days' + interval '5 minutes');
update public.bookings set status = 'pending', driver_id = null, dispatch_fallback_sent_at = now() where id = tests.sd('OLD');
select public.dispatch_new_booking_push(tests.sd('OLD'), 1);
select is(tests.sd_col('OLD', 'dispatch_launched_at'), now(), 'P1 putting it back up is a launch');
select is(tests.sd_col('OLD', 'dispatch_wave3_due_at'), now() + interval '10 minutes', 'P2 with its own third wave');
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 0, 'P3 no alert at once');
select tests.sd_advance(19, array['OLD']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 0, 'P4 none at +19 min');
select tests.sd_advance(1, array['OLD']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 1, 'P5 the admin is alerted 20 minutes after it was put back up');
select is(tests.sd_alert_text('OLD'), 'KEKE · ჯავშანი არავის მივიდა! | SD-OLD · Tbilisi airport → Tbilisi hotel · არცერთ მძღოლს არ მისულა',
  'P6 saying that it reached nobody');
select public.alert_undispatched_bookings();
select tests.sd_advance(90, array['OLD']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 1, 'P7 once per launch: no second alert, an hour and a half later either');
-- put back up again, this time only by the server's first wave
select public.dispatch_new_booking_push(tests.sd('OLD'), 1);
select tests.sd_advance(20, array['OLD']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 2, 'P8 the next launch alerts again, 20 minutes on');
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 2, 'P9 once');
-- the old way of putting it back up, first-dispatch time only (no wave): still counted
select tests.sd_advance(5, array['OLD']);
update public.bookings set dispatch_fallback_sent_at = now() where id = tests.sd('OLD');
select tests.sd_advance(20, array['OLD']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('OLD'), 3, 'P10 a launch marked only by the first-dispatch time alerts too');

-- a new booking that reached drivers and nobody took
select public.dispatch_new_booking_push(tests.sd('VIP'), 1);
select tests.sd_advance(6, array['VIP']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('VIP'), 0, 'P11 no alert six minutes after a new booking (it was five before)');
select tests.sd_advance(14, array['VIP']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('VIP'), 1, 'P12 the alert comes 20 minutes after the launch');
select is(tests.sd_alert_text('VIP'), 'KEKE · ჯავშანი არავინ აიღო! | SD-VIP · Tbilisi airport → Tbilisi hotel · 1 მძღოლს მიუვიდა, 20 წუთში არავინ აიღო',
  'P13 saying how many drivers it reached and that 20 minutes went by');

-- one a driver took within 20 minutes
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.sd('TAKEN'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(72), 'Tbilisi airport', 'Tbilisi hotel', 100,
        'sedan', 'economy', 2, 'SD-TAKEN');
select public.dispatch_new_booking_push(tests.sd('TAKEN'), 1);
select tests.act_as(tests.sd('S_ECO'));
select is(public.accept_booking_atomic(tests.sd('TAKEN'), tests.sd('S_ECO'), tests.sd('vS_ECO')) ->> 'ok', 'true',
  'P14 a driver takes it');
select tests.act_as_owner();
select tests.sd_advance(25, array['TAKEN']);
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('TAKEN'), 0, 'P15 a booking a driver took is never alerted');
select public.dispatch_due_second_waves();
select is(tests.sd_told('TAKEN'), 'S_ECO', 'P16 and no later wave goes out for it');

-- old ones: created three days ago and never put back up, or launched over a day ago
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code, created_at, dispatch_fallback_sent_at,
                             dispatch_launched_at)
values (tests.sd('STALE'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'Tbilisi airport', 'Tbilisi hotel', 100,
        'bus', 'economy', 30, 'SD-STALE', now() - interval '3 days', now() - interval '3 days', null),
       (tests.sd('LATE'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'Tbilisi airport', 'Tbilisi hotel', 100,
        'bus', 'economy', 30, 'SD-LATE', now() - interval '3 days', now() - interval '3 days', now() - interval '25 hours');
select public.alert_undispatched_bookings();
select is(tests.sd_alerts('STALE') + tests.sd_alerts('LATE'), 0,
  'P17 bookings whose latest launch is over a day old are left alone (no flood when this goes live)');

-- a convoy coordinator and a job offered by name get no third wave
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code, is_group_master)
values (tests.sd('MASTER'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'Tbilisi airport', 'Tbilisi hotel', 100,
        'minivan', 'economy', 4, 'SD-MASTER', true);
select public.dispatch_new_booking_push(tests.sd('MASTER'), 1);
select public.dispatch_new_booking_push(tests.sd('OFFER'), 1);
select is(tests.sd_col('MASTER', 'dispatch_wave3_due_at'), null, 'P18 a convoy coordinator gets no third wave');
select is(tests.sd_col('OFFER', 'dispatch_wave3_due_at'), null, 'P19 nor does a job offered to one driver by name');
select is(tests.sd_told('OFFER'), 'E_LOC', 'P20 the offer reaches its driver at once, as before');
select tests.sd_advance(15, array['MASTER', 'OFFER']);
select public.dispatch_due_second_waves();
select is(tests.sd_col('OFFER', 'dispatch_wave3_sent_at'), null, 'P21 no third wave ran for them');

-- a booking re-launched after its third wave: exact first again
select public.dispatch_new_booking_push(tests.sd('ECO'), 1);
select is(tests.sd_col('ECO', 'dispatch_wave3_sent_at'), null, 'P22 a new launch starts the ladder again: exact matches first');
select is(tests.sd_sees('C_LOC', 'ECO'), '', 'P23 so the comfort driver loses the job from his list until the new third wave');
select is(tests.sd_notices('C_LOC', 'ECO'), 1, 'P24 nobody already told is told again by the new launch');
select tests.sd_advance(10, array['ECO']);
select public.dispatch_due_second_waves();
select is(tests.sd_sees('C_LOC', 'ECO'), 'ECO', 'P25 ten minutes on it is back');
select is(tests.sd_notices('C_LOC', 'ECO'), 1, 'P26 still one notice');

-- 7. The push text ---------------------------------------------------------------------------

select is(public.booking_start_label_ka('2026-11-06T06:00:00.000Z'), '6 ნოემბერი, 10:00', 'T1 an instant in Tbilisi time');
select is(public.booking_start_label_ka('2026-01-31T20:30:00Z'), '1 თებერვალი, 00:30', 'T2 the next day, the next month, in Tbilisi');
select is(public.booking_start_label_ka('2026-11-06T06:00:00+04:00'), '6 ნოემბერი, 06:00', 'T3 an instant with an offset');
select is(public.booking_start_label_ka('2026-11-06 14:10:00.123456+00'), '6 ნოემბერი, 18:10', 'T4 Postgres'' own text form');
select is(public.booking_start_label_ka('2026-11-06T10:00'), '6 ნოემბერი, 10:00', 'T5 no zone: already Tbilisi time');
select is(public.booking_start_label_ka('2026-11-06'), '6 ნოემბერი', 'T6 a bare date');
select is(public.booking_start_label_ka('  ხვალ დილით '), 'ხვალ დილით', 'T7 text it cannot read comes back as written');
select is(public.booking_start_label_ka('06.11.2026 10:00'), '06.11.2026 10:00', 'T8 not guessed (day and month order)');
select is(public.booking_start_label_ka('2026-13-45T10:00:00Z'), '2026-13-45T10:00:00Z', 'T9 an impossible date comes back as written');
select is(public.booking_start_label_ka(''), null, 'T10 nothing gives null');
select is((select string_agg(public.booking_start_label_ka(format('2026-%s-01T08:00:00Z', lpad(m::text, 2, '0'))), ', ' order by m)
             from generate_series(1, 12) m),
  '1 იანვარი, 12:00, 1 თებერვალი, 12:00, 1 მარტი, 12:00, 1 აპრილი, 12:00, 1 მაისი, 12:00, 1 ივნისი, 12:00, '
  || '1 ივლისი, 12:00, 1 აგვისტო, 12:00, 1 სექტემბერი, 12:00, 1 ოქტომბერი, 12:00, 1 ნოემბერი, 12:00, 1 დეკემბერი, 12:00',
  'T11 every month''s name');
select is(public.booking_dispatch_message(tests.sd('FMT')) ->> 'body', 'Tbilisi airport → Kazbegi · 6 ნოემბერი, 10:00',
  'T12 the push body: the route, then the start in Tbilisi time');
select is(public.booking_dispatch_message(tests.sd('FMT')) ->> 'title', 'KEKE · ახალი ტრანსფერი!', 'T13 the title as before');
select public.dispatch_new_booking_push(tests.sd('FMT'), 1);
select is(tests.sd_push_texts('S_ECO', 'FMT'), 'KEKE · ახალი ტრანსფერი! | Tbilisi airport → Kazbegi · 6 ნოემბერი, 10:00',
  'T14 that is what reaches the driver''s phone');
select is((select n.body from public.notifications n where n.user_id = tests.sd('S_ECO') and n.type = 'new_booking'
            and n.data ->> 'booking_id' = tests.sd('FMT')::text), 'Tbilisi airport → Kazbegi · 6 ნოემბერი, 10:00',
  'T15 and his in-app notice');
update public.bookings set date_display = 'ხვალ დილით' where id = tests.sd('FMT');
select is(public.booking_dispatch_message(tests.sd('FMT')) ->> 'body', 'Tbilisi airport → Kazbegi · ხვალ დილით',
  'T16 a free-text start is shown as written, as before');
update public.bookings set date_display = null where id = tests.sd('FMT');
select is(public.booking_dispatch_message(tests.sd('FMT')) ->> 'body', 'Tbilisi airport → Kazbegi',
  'T17 no start: the route alone, as before');

select * from finish();
rollback;

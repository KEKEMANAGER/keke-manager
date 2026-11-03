-- Fleet invitations and one plate per driver (20261103170000_fleet_invites_and_one_plate).
-- A host finds a driver by email, invites him to one of his own cars, the
-- driver accepts or declines; nobody can put himself or anybody else on a car
-- that is not the host's, or skip the driver's yes. And one driver cannot hold
-- the same plate twice. Accounts from fixtures/p0_5_seed.sql: H a host (minivan
-- vH2, driven by S through the fleet), E1..E3 drivers with one sedan each, C1
-- a company. Every write is made the way PostgREST makes it (role
-- authenticated + the caller's JWT), under production's policies on
-- driver_fleet. One transaction, rolled back; nothing leaves the machine.
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

create or replace function tests.who(p_id uuid) returns text language sql stable as $$
  select coalesce((select n from unnest(array['C1','C2','ADM','E1','E2','E3','H','S']) n where tests.p5(n) = p_id),
                  case when p_id is null then 'none' else 'someone else' end)
$$;
create or replace function tests.resolve_as(p_who text, p_lookup text) returns text language plpgsql as $$
declare r uuid;
begin
  perform tests.act_as(tests.p5(p_who));
  r := public.resolve_driver_for_fleet_invite(p_lookup);
  perform tests.act_as_owner();
  return tests.who(r);
end $$;
create or replace function tests.directory_as(p_who text, p_host text) returns text language plpgsql as $$
declare out text;
begin
  perform tests.act_as(tests.p5(p_who));
  select coalesce(string_agg(tests.who(d.sub_driver_id) || ':' || coalesce(d.email, '-'), ','
                             order by tests.who(d.sub_driver_id)), '') into out
    from public.get_fleet_members_directory(tests.p5(p_host)) d;
  perform tests.act_as_owner();
  return out;
end $$;
create or replace function tests.fleet_of(p_sub text) returns text language sql security definer set search_path = public as $$
  select coalesce((select tests.who(f.host_driver_id) || '/' ||
                          coalesce((select n from unnest(array['vH1','vH2','vE1','vE2','vE3']) n where tests.p5(n) = f.vehicle_id), '?')
                          || '/' || f.status
                     from public.driver_fleet f where f.sub_driver_id = tests.p5(p_sub)), 'none')
$$;
create or replace function tests.fleet_row(p_sub text) returns uuid language sql security definer set search_path = public as $$
  select id from public.driver_fleet where sub_driver_id = tests.p5(p_sub)
$$;
grant execute on all functions in schema tests to public;

-- H gets a second car of his own, a sedan
select tests.act_as_owner();
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
values (tests.p5('vH1'), tests.p5('H'), 'sedan', 'comfort', 'Test model', 'TEST-vH1', 'approved', true, true);

-- 1. finding the driver to invite
select is(tests.resolve_as('H', 'p05-e2@test.invalid'), 'E2', 'F1 a host finds a driver by his email');
select is(tests.resolve_as('H', '  P05-E2@TEST.INVALID '), 'E2', 'F2 in any letters, with spaces around');
select is(tests.resolve_as('H', tests.p5('E2')::text), 'E2', 'F3 or by his id');
select is(tests.resolve_as('H', 'p05-c1@test.invalid'), 'none', 'F4 a company is not a driver to invite');
select is(tests.resolve_as('H', 'nobody@test.invalid'), 'none', 'F5 an unknown email finds nobody');
select is(tests.resolve_as('C1', 'p05-e2@test.invalid'), 'none', 'F6 a company cannot look drivers up');
select is(has_function_privilege('anon', 'public.resolve_driver_for_fleet_invite(text)', 'execute'), false,
  'F7 nor can anyone signed out');

-- 2. inviting: only to his own car, only as "pending", never himself
select tests.act_as(tests.p5('H'));
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'accepted')$q$, tests.p5('H'), tests.p5('E2'), tests.p5('vH1'))), -1,
  'F8 a host cannot put a driver in his fleet without the driver''s yes');
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id)
  values (%L, %L, %L)$q$, tests.p5('H'), tests.p5('E2'), tests.p5('vH1'))), -1,
  'F9 not even by leaving the status out (the table would make it accepted)');
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('H'), tests.p5('E2'), tests.p5('vE1'))), -1,
  'F10 a host cannot invite anybody to another driver''s car');
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('H'), tests.p5('E2'), tests.p5('vH1'))), 1,
  'F11 a host invites a driver to his own car');
select tests.act_as_owner();
select is(tests.fleet_of('E2'), 'H/vH1/pending', 'F12 the invitation waits for the driver');

select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('E1'), tests.p5('E3'), tests.p5('vH1'))), -1,
  'F13 a driver cannot hand out another host''s car');
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('H'), tests.p5('E1'), tests.p5('vH2'))), -1,
  'F14 nor write an invitation in the host''s name');
select tests.act_as_owner();

-- 3. the host's list of his drivers
select is(tests.directory_as('H', 'H'), 'E2:p05-e2@test.invalid,S:p05-s@test.invalid',
  'F15 the host sees his invited and accepted drivers');
select is(tests.directory_as('E2', 'H'), '', 'F16 nobody else sees the host''s list');

-- 4. the invited driver: accepts as he was invited, nothing else
select tests.act_as(tests.p5('H'));
select is(tests.try_sql(format($q$update public.driver_fleet set status = 'accepted' where id = %L$q$, tests.fleet_row('E2'))), -1,
  'F17 the host cannot accept for the driver');
select tests.act_as(tests.p5('E2'));
select is(tests.try_sql(format($q$update public.driver_fleet set status = 'accepted', vehicle_id = %L where id = %L$q$,
  tests.p5('vH2'), tests.fleet_row('E2'))), -1, 'F18 the driver cannot pick another car while accepting');
select is(tests.try_sql(format($q$update public.driver_fleet set status = 'accepted', host_driver_id = %L where id = %L$q$,
  tests.p5('E1'), tests.fleet_row('E2'))), -1, 'F19 nor move the invitation to another host');
select is(tests.try_sql(format($q$update public.driver_fleet set status = 'accepted' where id = %L$q$, tests.fleet_row('E2'))), 1,
  'F20 the driver accepts');
select tests.act_as_owner();
select is(tests.fleet_of('E2'), 'H/vH1/accepted', 'F21 and is in the host''s fleet on that car');
select is(public.vehicle_usable_by_driver(tests.p5('vH1'), tests.p5('E2')), true, 'F22 and may take jobs with it');
select is(public.vehicle_usable_by_driver(tests.p5('vE1'), tests.p5('E2')), false, 'F23 and with no one else''s car');

-- 5. declining
select tests.act_as(tests.p5('H'));
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('H'), tests.p5('E3'), tests.p5('vH2'))), -2,
  'F24 a car already driven by someone in the fleet takes no second driver (the table refuses)');
select tests.act_as_owner();
delete from public.driver_fleet where sub_driver_id = tests.p5('E2');
select tests.act_as(tests.p5('H'));
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('H'), tests.p5('E3'), tests.p5('vH1'))), 1, 'F25 the host invites E3');
select tests.act_as(tests.p5('E2'));
select is(tests.try_sql(format('delete from public.driver_fleet where id = %L', tests.fleet_row('E3'))), 0,
  'F26 nobody else can take the invitation away');
select tests.act_as(tests.p5('E3'));
select is(tests.try_sql(format('delete from public.driver_fleet where id = %L', tests.fleet_row('E3'))), 1,
  'F27 the invited driver declines it');
select tests.act_as_owner();
select is(tests.fleet_of('E3'), 'none', 'F28 and it is gone');
select is(tests.fleet_of('S'), 'H/vH2/accepted', 'F29 the fleet the host already had is untouched');

-- 6. the host's own changes to an invitation still work
select tests.act_as(tests.p5('H'));
select is(tests.try_sql(format($q$insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
  values (%L, %L, %L, 'pending')$q$, tests.p5('H'), tests.p5('E3'), tests.p5('vH1'))), 1, 'F30 invited again');
select is(tests.try_sql(format($q$update public.driver_fleet set status = 'pending', vehicle_id = %L where id = %L$q$,
  tests.p5('vH1'), tests.fleet_row('E3'))), 1, 'F31 the host re-sends it (the app''s re-invite)');
select is(tests.try_sql(format($q$update public.driver_fleet set vehicle_id = %L where id = %L$q$,
  tests.p5('vE1'), tests.fleet_row('E3'))), -1, 'F32 but cannot switch it to someone else''s car');
select is(tests.try_sql(format('delete from public.driver_fleet where id = %L', tests.fleet_row('E3'))), 1,
  'F33 and can withdraw it');
select tests.act_as_owner();

-- 7. one plate per driver
select tests.act_as(tests.p5('E1'));
select is(tests.sqlstate_of(format($q$insert into public.vehicles (driver_id, type, class, model, plate)
  values (%L, 'sedan', 'comfort', 'Same car', 'TEST-vE1')$q$, tests.p5('E1'))), '23505',
  'P1 a driver cannot add his own car a second time');
select is(tests.sqlstate_of(format($q$insert into public.vehicles (driver_id, type, class, model, plate)
  values (%L, 'sedan', 'comfort', 'Same car', ' test vE1 ')$q$, tests.p5('E1'))), '23505',
  'P2 not with spaces, dashes or other letters either');
select is(tests.try_sql(format($q$insert into public.vehicles (driver_id, type, class, model, plate)
  values (%L, 'sedan', 'comfort', 'Another car', 'TEST-NEW-1')$q$, tests.p5('E1'))), 1,
  'P3 a car with another plate is added');
select is(tests.try_sql(format($q$insert into public.vehicles (driver_id, type, class, plate) values (%L, 'sedan', 'comfort', null)$q$,
  tests.p5('E1'))), 1, 'P4 blank cards (no plate yet) are not limited');
select is(tests.try_sql(format($q$insert into public.vehicles (driver_id, type, class, plate) values (%L, 'sedan', 'comfort', null)$q$,
  tests.p5('E1'))), 1, 'P5 not even two of them');
select is(tests.try_sql(format($q$update public.vehicles set model = 'Renamed', plate = 'TEST-vE1' where id = %L$q$,
  tests.p5('vE1'))), 1, 'P6 a driver saves his car with its own plate');
select is(tests.sqlstate_of(format($q$update public.vehicles set plate = 'test-ve1' where driver_id = %L and plate = 'TEST-NEW-1'$q$,
  tests.p5('E1'))), '23505', 'P7 and cannot rename another of his cars to that plate');
select tests.act_as(tests.p5('E2'));
select is(tests.try_sql(format($q$insert into public.vehicles (driver_id, type, class, model, plate)
  values (%L, 'sedan', 'comfort', 'Other owner', 'TEST-vE1')$q$, tests.p5('E2'))), 1,
  'P8 another driver is not stopped by this rule (the app asks him separately)');
select tests.act_as_owner();

select * from finish();
rollback;

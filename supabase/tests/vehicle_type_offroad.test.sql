-- 4x4 cars (20261107100000_vehicle_type_offroad.sql), on the smart-dispatch seed.
-- Runs as the database owner except where it acts as a driver; rolled back.
begin;
select plan(9);
\ir fixtures/smart_dispatch_seed.sql

-- a driver marks his car 4x4 and saves it, the way the app does
select tests.act_as(tests.sd('E_LOC'));
select lives_ok($$
  update public.vehicles set type = 'offroad', class = 'economy', capacity_tier = null, passenger_capacity = 4,
                             model = 'Land Cruiser', plate = 'OF-404-RD', updated_at = now()
   where id = tests.sd('vE_LOC') and driver_id = tests.sd('E_LOC') $$,
  'a driver saves his car as 4x4');
select tests.act_as_owner();
select is((select type from public.vehicles where id = tests.sd('vE_LOC')), 'offroad', 'the car is 4x4');
select is((select vehicle_type from public.profiles where id = tests.sd('E_LOC')), 'offroad', 'and so is his profile');

-- a company books a 4x4: the 4x4 driver is in the pool, a sedan driver is not
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.sd('OFF4'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'Tbilisi', 'Tusheti', 400,
        'offroad', 'economy', 4, 'SD-OFF4');
select ok(exists (select 1 from public.booking_dispatch_pool(tests.sd('OFF4'), false, tests.sd('E_LOC'))),
          'a 4x4 job reaches the 4x4 driver');
select ok(not exists (select 1 from public.booking_dispatch_pool(tests.sd('OFF4'), true, tests.sd('S_ECO'))),
          'and not a sedan driver, not even in the widened wave');

-- every type the app offers is accepted, and the old Georgian labels still are
select lives_ok($$
  do $t$ declare t text; begin
    foreach t in array array['sedan', 'minivan', 'suv', 'offroad', 'microbus', 'bus', 'special',
                             'სედანი', 'მინივენი', 'მიკროავტობუსი', 'ავტობუსი', 'სპეც. ტრანსპორტი'] loop
      update public.vehicles set type = t where id = tests.sd('vE_FAR');
    end loop;
  end $t$ $$, 'every type the app offers, and the old labels, are accepted');

-- anything else is still refused
select throws_ok($$ update public.vehicles set type = 'jeep' where id = tests.sd('vE_FAR') $$,
                 '23514', null, 'an unknown type is still refused');

-- the undo stops while a car is 4x4, and works once none is
select throws_like($$ do $u$ begin
    if exists (select 1 from public.vehicles where type = 'offroad') then
      raise exception 'cars marked 4x4 (offroad) exist - change their type first - stop';
    end if; end $u$ $$, '%cars marked 4x4%', 'the undo will not run while a car is 4x4');
update public.vehicles set type = 'suv' where type = 'offroad';
\ir ../rollback/20261107100000_vehicle_type_offroad_undo.sql
select throws_ok($$ update public.vehicles set type = 'offroad' where id = tests.sd('vE_FAR') $$,
                 '23514', null, 'after the undo, 4x4 is refused again');

select * from finish();
rollback;

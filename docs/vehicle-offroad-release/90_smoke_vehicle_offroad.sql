-- KEKE: 4x4 cars - smoke test after 10_apply_vehicle_offroad.sql.
-- A driver and a car that exist only inside this transaction, which is ROLLED BACK.
-- No real row is read or changed; nobody is notified. Every "ok" must be true.
begin;
create temp table _smoke (n serial, check_name text, ok boolean);
do $smoke$
declare d uuid := gen_random_uuid(); car uuid := gen_random_uuid(); refused boolean;
begin
  insert into auth.users (id, email) values (d, 'offroad-smoke-driver@kekemanager.com');
  insert into public.users (id, role, full_name, email, is_verified, verification_status)
  values (d, 'driver', 'Offroad smoke driver', 'offroad-smoke-driver@kekemanager.com', false, 'pending')
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
  insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
  values (car, d, 'sedan', 'economy', null, null, 'pending', false, false);
  update public.vehicles set type = 'offroad', model = 'Smoke 4x4', plate = 'SM-404-KE', passenger_capacity = 4 where id = car;
  insert into _smoke (check_name, ok) values ('a car can be saved as 4x4', (select type = 'offroad' from public.vehicles where id = car));
  begin
    update public.vehicles set type = 'jeep' where id = car;
    refused := false;
  exception when check_violation then
    refused := true;
  end;
  insert into _smoke (check_name, ok) values ('an unknown type is still refused', refused);
  insert into _smoke (check_name, ok) values ('nothing was notified', not exists (select 1 from public.notifications where user_id = d));
end
$smoke$;
select n, check_name, ok from _smoke order by n;
select case when bool_and(ok) and count(*) = 3 then 'ALL SMOKE CHECKS PASSED (3)' else 'SMOKE FAILED' end as result from _smoke;
rollback;

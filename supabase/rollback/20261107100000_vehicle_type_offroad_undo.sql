-- Undo 20261107100000_vehicle_type_offroad.sql: 'offroad' is refused again.
-- Stops if a car is already marked 4x4 (the old rule would refuse that row):
-- change those cars' type first. Run it as one transaction. It can be run again.
do $$
begin
  if exists (select 1 from public.vehicles where type = 'offroad') then
    raise exception 'cars marked 4x4 (offroad) exist - change their type first - stop';
  end if;
end
$$;
alter table public.vehicles drop constraint if exists vehicles_type_check;
alter table public.vehicles add constraint vehicles_type_check
  check (type = any (array['sedan', 'minivan', 'suv', 'microbus', 'bus', 'special',
                           'სედანი', 'მინივენი', 'მიკროავტობუსი', 'ავტობუსი', 'სპეც. ტრანსპორტი']));

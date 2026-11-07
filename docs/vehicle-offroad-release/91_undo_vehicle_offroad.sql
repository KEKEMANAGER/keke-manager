-- KEKE: 4x4 cars - undo. Commits only if every check passes; stops if a car is already 4x4.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $before$ begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.vehicles'::regclass and c.conname = 'vehicles_type_check') is distinct from $q$CHECK ((type = ANY (ARRAY['sedan'::text, 'minivan'::text, 'suv'::text, 'offroad'::text, 'microbus'::text, 'bus'::text, 'special'::text, 'სედანი'::text, 'მინივენი'::text, 'მიკროავტობუსი'::text, 'ავტობუსი'::text, 'სპეც. ტრანსპორტი'::text])))$q$ then raise exception 'vehicles_type_check is not the release''s - stop'; end if;
end $before$;
-- ===== supabase/rollback/20261107100000_vehicle_type_offroad_undo.sql, verbatim =====
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
-- ===== end of the undo =====
do $after$ begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.vehicles'::regclass and c.conname = 'vehicles_type_check') is distinct from $q$CHECK ((type = ANY (ARRAY['sedan'::text, 'minivan'::text, 'suv'::text, 'microbus'::text, 'bus'::text, 'special'::text, 'სედანი'::text, 'მინივენი'::text, 'მიკროავტობუსი'::text, 'ავტობუსი'::text, 'სპეც. ტრანსპორტი'::text])))$q$ then raise exception 'vehicles_type_check is not back to production''s - stop'; end if;
end $after$;
delete from supabase_migrations.schema_migrations where version = '20261107100000';
select '4x4 undone' as result, now() as at;
commit;

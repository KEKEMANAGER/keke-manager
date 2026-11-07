-- KEKE: 4x4 cars can be saved - step 1: apply
-- Source: supabase/migrations/20261107100000_vehicle_type_offroad.sql (md5 ae58273dcac9249ec797aadc4c25c865)
-- Run as ONE call. It commits only if every check passes; otherwise nothing changes.
-- No row is changed and nobody is notified.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $before$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261107100000') then
    raise exception 'already in the migration history - stop';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.vehicles'::regclass and c.conname = 'vehicles_type_check') is distinct from $q$CHECK ((type = ANY (ARRAY['sedan'::text, 'minivan'::text, 'suv'::text, 'microbus'::text, 'bus'::text, 'special'::text, 'სედანი'::text, 'მინივენი'::text, 'მიკროავტობუსი'::text, 'ავტობუსი'::text, 'სპეც. ტრანსპორტი'::text])))$q$ then
    raise exception 'vehicles_type_check is not production''s of 7 Nov 2026 - stop';
  end if;
end
$before$;

create temp table _snap on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(v.id::text || '/' || coalesce(v.type, '-') || '/' || coalesce(v.updated_at::text, '-'), ',' order by v.id), '')) from public.vehicles v) as h;

-- ===== supabase/migrations/20261107100000_vehicle_type_offroad.sql, verbatim =====
-- Cars marked "4x4 (ოფროუდი)" can be saved.
--
-- The driver app has offered the car type 'offroad' ("4x4 (ოფროუდი)",
-- lib/vehicleCatalog.ts, since commit 23002fe "SUV split from 4x4"), but the
-- database's vehicles_type_check never allowed it: every save of a car marked
-- 4x4 was refused with a check-constraint error, so the car stayed an empty
-- draft that KEKE could not approve (7 Nov 2026: a driver tried seven times).
-- Asked for by the founder, 7 Nov 2026: "დავამატოთ სასწრაფოდ".
--
-- Adds 'offroad' to the allowed types; every value allowed before stays allowed
-- and nothing else changes. No row is changed (the 140 cars are re-checked).
-- Undo: supabase/rollback/20261107100000_vehicle_type_offroad_undo.sql
alter table public.vehicles drop constraint if exists vehicles_type_check;
alter table public.vehicles add constraint vehicles_type_check
  check (type = any (array['sedan', 'minivan', 'suv', 'offroad', 'microbus', 'bus', 'special',
                           'სედანი', 'მინივენი', 'მიკროავტობუსი', 'ავტობუსი', 'სპეც. ტრანსპორტი']));
-- ===== end of the migration =====

do $after$
begin
  if (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = 'public.vehicles'::regclass and c.conname = 'vehicles_type_check') is distinct from $q$CHECK ((type = ANY (ARRAY['sedan'::text, 'minivan'::text, 'suv'::text, 'offroad'::text, 'microbus'::text, 'bus'::text, 'special'::text, 'სედანი'::text, 'მინივენი'::text, 'მიკროავტობუსი'::text, 'ავტობუსი'::text, 'სპეც. ტრანსპორტი'::text])))$q$ then
    raise exception 'vehicles_type_check is not as intended - stop';
  end if;
  if (select h from _snap) is distinct from (select count(*) || ':' || md5(coalesce(string_agg(v.id::text || '/' || coalesce(v.type, '-') || '/' || coalesce(v.updated_at::text, '-'), ',' order by v.id), '')) from public.vehicles v) then
    raise exception 'cars changed - stop';
  end if;
end
$after$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261107100000', 'vehicle_type_offroad', array['-- applied from supabase/migrations/20261107100000_vehicle_type_offroad.sql (md5 ae58273dcac9249ec797aadc4c25c865) by docs/vehicle-offroad-release'], 'vehicle-offroad-release');

select '4x4 cars can be saved' as result, now() as at, (select count(*) from public.vehicles) as cars_unchanged;
commit;

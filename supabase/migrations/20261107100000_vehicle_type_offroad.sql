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

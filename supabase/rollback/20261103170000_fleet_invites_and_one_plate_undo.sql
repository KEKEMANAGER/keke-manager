-- Undo 20261103170000_fleet_invites_and_one_plate.sql: production as before it
-- (no fleet look-up functions, no guard, host-only delete, no plate rule).
-- Fleet rows written while it was in place stay; they were checked when written.
drop index if exists public.vehicles_one_plate_per_driver;
drop policy if exists driver_fleet_sub_decline on public.driver_fleet;
drop trigger if exists driver_fleet_guard on public.driver_fleet;
drop function if exists public.driver_fleet_guard();
drop function if exists public.get_fleet_members_directory(uuid);
drop function if exists public.resolve_driver_for_fleet_invite(text);

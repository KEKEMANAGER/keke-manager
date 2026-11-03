-- Fleet invitations work again, safely; and one driver cannot add the same car
-- twice.
--
-- 1. resolve_driver_for_fleet_invite() and get_fleet_members_directory(): the
--    two functions the app's fleet screens call (lib/fleet.ts). They were
--    written in 20260630190000, which never reached production, so every
--    invitation stopped at "function not found". Only these two are added,
--    as they were written there; nothing else from that old file is applied
--    (later work replaced the rest of it).
--
-- 2. A guard on driver_fleet. An accepted row lets its driver take jobs with
--    the car (vehicle_usable_by_driver, booking_dispatch_candidates), so a row
--    must be what the app makes of it: the host's own car, another driver,
--    "pending" until that driver himself accepts it, and nobody moves it to
--    another host or driver. The table's policies only checked whose row it
--    was, so a signed-in driver could have written himself onto anybody's
--    car. The table holds no rows yet; nothing existing is affected.
--
-- 3. A driver may decline (delete) an invitation sent to him: the app's
--    "decline" deletes the row, which only the host was allowed to do, so it
--    quietly did nothing.
--
-- 4. One plate per driver: the same car cannot be on one driver's account
--    twice (a car added again instead of fixing the rejected one, a second
--    tap on "save"). Spaces, dots and dashes do not make another plate.
--
-- Rollback: supabase/rollback/20261103170000_fleet_invites_and_one_plate_undo.sql

-- 1. the invitation look-up and the host's list of his drivers
create or replace function public.resolve_driver_for_fleet_invite(p_lookup text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lookup text := btrim(coalesce(p_lookup, ''));
  v_id     uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  if not exists (select 1 from public.users where id = auth.uid() and role = 'driver') then
    return null;
  end if;
  if v_lookup = '' then
    return null;
  end if;
  if v_lookup ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id into v_id
      from public.users u
     where u.id = v_lookup::uuid
       and u.role = 'driver';
  else
    select u.id into v_id
      from public.users u
     where u.role = 'driver'
       and lower(btrim(u.email)) = lower(v_lookup)
     limit 1;
  end if;
  return v_id;
end;
$$;

revoke all on function public.resolve_driver_for_fleet_invite(text) from public, anon;
grant execute on function public.resolve_driver_for_fleet_invite(text) to authenticated, service_role;

create or replace function public.get_fleet_members_directory(p_host_driver_id uuid)
returns table (sub_driver_id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select f.sub_driver_id, u.full_name, u.email
    from public.driver_fleet f
    join public.users u on u.id = f.sub_driver_id
   where f.host_driver_id = p_host_driver_id
     and f.status in ('pending', 'accepted')
     and auth.uid() = p_host_driver_id
     and exists (select 1 from public.users me where me.id = auth.uid() and me.role = 'driver');
$$;

revoke all on function public.get_fleet_members_directory(uuid) from public, anon;
grant execute on function public.get_fleet_members_directory(uuid) to authenticated, service_role;

-- 2. a fleet row is what the app makes of it
create or replace function public.driver_fleet_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  me uuid := auth.uid();
begin
  if coalesce(auth.role(), '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin')
     or public.is_admin_user() then
    return new;
  end if;
  if new.host_driver_id is null or new.sub_driver_id is null or new.vehicle_id is null then
    raise exception 'driver_fleet: a host, a driver and a car are needed' using errcode = '42501';
  end if;
  if new.sub_driver_id = new.host_driver_id then
    raise exception 'driver_fleet: a host is not a driver in his own fleet' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles v
                  where v.id = new.vehicle_id and v.driver_id = new.host_driver_id) then
    raise exception 'driver_fleet: the car is not the host''s' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'driver_fleet: an invitation starts as pending; only the driver accepts it'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.host_driver_id is distinct from old.host_driver_id
     or new.sub_driver_id is distinct from old.sub_driver_id then
    raise exception 'driver_fleet: the host and the driver of an invitation do not change' using errcode = '42501';
  end if;
  if me is not distinct from old.sub_driver_id then
    if new.vehicle_id is distinct from old.vehicle_id then
      raise exception 'driver_fleet: only the host chooses the car' using errcode = '42501';
    end if;
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    raise exception 'driver_fleet: only the driver accepts an invitation' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

revoke all on function public.driver_fleet_guard() from public, anon, authenticated;

drop trigger if exists driver_fleet_guard on public.driver_fleet;
create trigger driver_fleet_guard
  before insert or update on public.driver_fleet
  for each row execute function public.driver_fleet_guard();

-- 3. the invited driver may decline
drop policy if exists driver_fleet_sub_decline on public.driver_fleet;
create policy driver_fleet_sub_decline on public.driver_fleet
  for delete to authenticated
  using (sub_driver_id = auth.uid() and status = 'pending');

-- 4. one plate per driver
create unique index if not exists vehicles_one_plate_per_driver
  on public.vehicles (driver_id, upper(regexp_replace(plate, '[[:space:].-]', '', 'g')))
  where plate is not null and btrim(plate) <> '';

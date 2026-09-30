-- A verified driver whose only vehicle sits at is_active = false is invisible to
-- the whole dispatch system: `fetchMatchingDriverPushRecipients` and the open
-- job board both filter on `is_active`. Measured on live data: 4 approved
-- vehicles, 1 active — so three verified drivers could never be offered a
-- single job, and nothing in the app told them why. Activation was a button
-- they had to find and press.
--
-- From now on, approving a driver's vehicle activates it — but only when that
-- driver has no other active vehicle, so a driver who deliberately switched
-- cars keeps their choice.

create or replace function public.vehicles_activate_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status = 'approved'
     and coalesce(new.is_active, false) = false
     and new.driver_id is not null
     and not exists (
       select 1 from public.vehicles v
        where v.driver_id = new.driver_id
          and v.id <> new.id
          and v.is_active = true
     )
  then
    new.is_active := true;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_activate_on_approval on public.vehicles;

create trigger vehicles_activate_on_approval
before insert or update of verification_status, is_verified on public.vehicles
for each row
execute function public.vehicles_activate_on_approval();

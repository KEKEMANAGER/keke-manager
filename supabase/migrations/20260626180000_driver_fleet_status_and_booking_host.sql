-- Fleet invites: pending → accepted | rejected
alter table public.driver_fleet
  add column if not exists status text not null default 'accepted';

alter table public.driver_fleet
  drop constraint if exists driver_fleet_status_check;

alter table public.driver_fleet
  add constraint driver_fleet_status_check
  check (status in ('pending', 'accepted', 'rejected'));

create index if not exists driver_fleet_status_idx on public.driver_fleet (status);

-- Sub driver: accept or reject pending invite
drop policy if exists "driver_fleet_sub_update_status" on public.driver_fleet;
create policy "driver_fleet_sub_update_status" on public.driver_fleet
  for update to authenticated
  using (sub_driver_id = auth.uid() and status = 'pending')
  with check (
    sub_driver_id = auth.uid()
    and status in ('accepted', 'rejected')
  );

-- Host on booking (company sees host + sub driver)
alter table public.bookings
  add column if not exists host_driver_id uuid references auth.users (id) on delete set null;

create index if not exists bookings_host_driver_id_idx on public.bookings (host_driver_id);

-- Fleet host GPS: only accepted subs
drop policy if exists "driver_locations_fleet_host_read" on public.driver_locations;
create policy "driver_locations_fleet_host_read" on public.driver_locations
  for select to authenticated
  using (
    exists (
      select 1 from public.driver_fleet f
      where f.host_driver_id = auth.uid()
        and f.sub_driver_id = driver_locations.driver_id
        and f.status = 'accepted'
    )
  );

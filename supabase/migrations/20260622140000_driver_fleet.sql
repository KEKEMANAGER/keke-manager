-- Fleet: host driver assigns sub-drivers to vehicles.
create table if not exists public.driver_fleet (
  id uuid primary key default gen_random_uuid(),
  host_driver_id uuid not null references auth.users (id) on delete cascade,
  sub_driver_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint driver_fleet_sub_unique unique (sub_driver_id),
  constraint driver_fleet_vehicle_unique unique (vehicle_id),
  constraint driver_fleet_not_self check (host_driver_id <> sub_driver_id)
);

create index if not exists driver_fleet_host_idx on public.driver_fleet (host_driver_id);
create index if not exists driver_fleet_sub_idx on public.driver_fleet (sub_driver_id);

alter table public.driver_fleet enable row level security;

-- Host: manage own fleet rows
drop policy if exists "driver_fleet_host_select" on public.driver_fleet;
create policy "driver_fleet_host_select" on public.driver_fleet
  for select to authenticated
  using (host_driver_id = auth.uid());

drop policy if exists "driver_fleet_host_insert" on public.driver_fleet;
create policy "driver_fleet_host_insert" on public.driver_fleet
  for insert to authenticated
  with check (host_driver_id = auth.uid());

drop policy if exists "driver_fleet_host_update" on public.driver_fleet;
create policy "driver_fleet_host_update" on public.driver_fleet
  for update to authenticated
  using (host_driver_id = auth.uid())
  with check (host_driver_id = auth.uid());

drop policy if exists "driver_fleet_host_delete" on public.driver_fleet;
create policy "driver_fleet_host_delete" on public.driver_fleet
  for delete to authenticated
  using (host_driver_id = auth.uid());

-- Sub driver: read own fleet assignment only
drop policy if exists "driver_fleet_sub_select" on public.driver_fleet;
create policy "driver_fleet_sub_select" on public.driver_fleet
  for select to authenticated
  using (sub_driver_id = auth.uid());

-- Company / admin: read fleet (for tracking)
drop policy if exists "driver_fleet_company_select" on public.driver_fleet;
create policy "driver_fleet_company_select" on public.driver_fleet
  for select to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role in ('company', 'admin')
    )
  );

grant select, insert, update, delete on public.driver_fleet to authenticated;

-- Host can read sub-driver GPS locations
drop policy if exists "driver_locations_fleet_host_read" on public.driver_locations;
create policy "driver_locations_fleet_host_read" on public.driver_locations
  for select to authenticated
  using (
    exists (
      select 1 from public.driver_fleet f
      where f.host_driver_id = auth.uid()
        and f.sub_driver_id = driver_locations.driver_id
    )
  );

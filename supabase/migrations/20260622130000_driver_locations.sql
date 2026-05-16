-- One row per driver, upserted in-place for real-time GPS tracking.
create table if not exists public.driver_locations (
  driver_id  uuid primary key references auth.users(id) on delete cascade,
  latitude   float8 not null,
  longitude  float8 not null,
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;

-- Driver: full access to own row
create policy "driver_locations_self"
  on public.driver_locations
  for all
  using  (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);

-- Company / admin: read any driver location
create policy "driver_locations_company_read"
  on public.driver_locations
  for select
  using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('company', 'admin')
    )
  );

-- Enable Realtime
alter publication supabase_realtime add table public.driver_locations;
alter table public.driver_locations replica identity full;

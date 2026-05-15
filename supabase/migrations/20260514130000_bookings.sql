-- Bookings: company creates (pending, driver_id null); driver accepts -> confirmed + driver fields.
-- Realtime: add table to publication (Supabase Dashboard → Database → Replication if this fails).

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id text not null, -- Clerk user id (e.g. user_...), never uuid
  driver_id text, -- Clerk user id when assigned; nullable
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'completed', 'cancelled')),
  booking_type text not null check (booking_type in ('transfer', 'tour', 'day_tour')),
  from_location text,
  to_location text,
  route_description text,
  date_display text,
  passengers int not null default 1,
  vehicle_class text not null,
  flight_number text,
  comment text,
  payment_method text,
  price_gel numeric not null,
  company_name text,
  driver_display_name text,
  driver_phone text,
  driver_plate text
);

create index if not exists bookings_company_id_idx on public.bookings (company_id);
create index if not exists bookings_driver_id_idx on public.bookings (driver_id);
create index if not exists bookings_status_idx on public.bookings (status);

alter table public.bookings enable row level security;

drop policy if exists "bookings_anon_all" on public.bookings;
create policy "bookings_anon_all" on public.bookings
  for all
  to anon
  using (true)
  with check (true);

alter publication supabase_realtime add table public.bookings;

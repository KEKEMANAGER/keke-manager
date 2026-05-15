-- Driver avatar (public.users) + vehicle photos (public.vehicles) + Storage bucket "media"

alter table public.users add column if not exists avatar_url text;

create table if not exists public.vehicles (
  driver_clerk_id text primary key,
  photo_front text,
  photo_left text,
  photo_right text,
  photo_interior text,
  photo_rear text,
  updated_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

drop policy if exists "vehicles_anon_all" on public.vehicles;
create policy "vehicles_anon_all" on public.vehicles
  for all
  to anon
  using (true)
  with check (true);

-- Storage bucket (public URLs for getPublicUrl)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = excluded.public;

-- Storage RLS: allow anon read/write for app (same model as public tables; tighten in production)
drop policy if exists "media_select" on storage.objects;
create policy "media_select" on storage.objects
  for select to anon using (bucket_id = 'media');

drop policy if exists "media_insert" on storage.objects;
create policy "media_insert" on storage.objects
  for insert to anon with check (bucket_id = 'media');

drop policy if exists "media_update" on storage.objects;
create policy "media_update" on storage.objects
  for update to anon using (bucket_id = 'media') with check (bucket_id = 'media');

drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects
  for delete to anon using (bucket_id = 'media');

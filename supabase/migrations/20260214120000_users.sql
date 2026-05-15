-- Clerk user mirror. Run in Supabase SQL editor or via CLI.
-- Security: permissive anon policies for Expo + Clerk (no Supabase Auth JWT).
-- For production, prefer an Edge Function + service_role key instead of open anon writes.

create table if not exists public.users (
  clerk_id text primary key,
  role text check (role is null or role in ('driver', 'company')),
  full_name text,
  email text
);

alter table public.users enable row level security;

drop policy if exists "users_sync_anon_all" on public.users;
create policy "users_sync_anon_all" on public.users
  for all
  to anon
  using (true)
  with check (true);

-- =============================================================================
-- RLS hardening for anon role (Expo app uses Supabase anon key + Clerk outside Supabase).
-- =============================================================================
-- TODO: Full RLS requires Supabase Auth + Clerk JWT integration so policies can use
--       auth.uid() / custom JWT claims instead of wide-open anon reads/writes.
--
-- Backlog: bookings INSERT — restrict WITH CHECK so company_id matches the caller
--           (e.g. request header x-clerk-user-id via Edge Function + service_role,
--           or Supabase Third-Party Auth linking Clerk).
--
-- This migration removes permissive FOR ALL policies and replaces them with
-- explicit SELECT / INSERT / UPDATE for anon. DELETE is intentionally omitted:
-- without a DELETE policy, anon cannot delete rows (deny by default under RLS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.bookings
-- ---------------------------------------------------------------------------
drop policy if exists "bookings_anon_all" on public.bookings;

create policy "bookings_anon_select" on public.bookings
  for select
  to anon
  using (true);

-- INSERT kept open for app compatibility; tighten when Clerk JWT is available (see backlog above).
create policy "bookings_anon_insert" on public.bookings
  for insert
  to anon
  with check (true);

create policy "bookings_anon_update" on public.bookings
  for update
  to anon
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- public.users
-- ---------------------------------------------------------------------------
drop policy if exists "users_sync_anon_all" on public.users;

create policy "users_anon_select" on public.users
  for select
  to anon
  using (true);

create policy "users_anon_insert" on public.users
  for insert
  to anon
  with check (true);

create policy "users_anon_update" on public.users
  for update
  to anon
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- public.vehicles
-- ---------------------------------------------------------------------------
drop policy if exists "vehicles_anon_all" on public.vehicles;

create policy "vehicles_anon_select" on public.vehicles
  for select
  to anon
  using (true);

create policy "vehicles_anon_insert" on public.vehicles
  for insert
  to anon
  with check (true);

create policy "vehicles_anon_update" on public.vehicles
  for update
  to anon
  using (true)
  with check (true);

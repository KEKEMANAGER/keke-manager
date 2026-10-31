-- Undo P0-6 (20261101150000_booking_ownership).
--
-- Puts back exactly what production had before P0-6: the guard and its two
-- helpers go, and the three UPDATE policies come back as they were -
-- including "Enable update for booking owners" with `with check (true)`, i.e.
-- the hole P0-6 closes. Use it only if P0-6 blocks a legitimate flow that
-- cannot be fixed forward quickly. It changes no rows. P0-1 .. P0-5 do not
-- depend on P0-6; undo P0-6 before any of them.

drop trigger if exists bookings_guard_ownership on public.bookings;
drop function if exists public.bookings_guard_ownership();
drop function if exists public.booking_driver_assignable(uuid, uuid);
drop function if exists public.booking_convoy_open_for(uuid, uuid);

drop policy if exists "Companies update own bookings" on public.bookings;
create policy "Companies update own bookings" on public.bookings
  as permissive for update to public
  using (auth.uid() = company_id);

drop policy if exists "Drivers update assigned bookings" on public.bookings;
create policy "Drivers update assigned bookings" on public.bookings
  as permissive for update to public
  using (auth.uid() = driver_id);

drop policy if exists "Enable update for booking owners" on public.bookings;
create policy "Enable update for booking owners" on public.bookings
  as permissive for update to authenticated
  using (auth.uid() in (select profiles.id from public.profiles where profiles.id = bookings.company_id))
  with check (true);

-- Optional meet-and-greet sign logo (B2B client branding) on bookings.

alter table public.bookings
  add column if not exists pickup_sign_logo_url text;

insert into storage.buckets (id, name, public)
values ('booking-pickup-signs', 'booking-pickup-signs', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "pickup_signs_public_read" on storage.objects;
create policy "pickup_signs_public_read" on storage.objects
  for select
  using (bucket_id = 'booking-pickup-signs');

drop policy if exists "pickup_signs_authenticated_insert" on storage.objects;
create policy "pickup_signs_authenticated_insert" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'booking-pickup-signs');

drop policy if exists "pickup_signs_authenticated_update" on storage.objects;
create policy "pickup_signs_authenticated_update" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'booking-pickup-signs')
  with check (bucket_id = 'booking-pickup-signs');

drop policy if exists "pickup_signs_authenticated_delete" on storage.objects;
create policy "pickup_signs_authenticated_delete" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'booking-pickup-signs');

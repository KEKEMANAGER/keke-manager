-- Security lockdown, 27 Oct 2026 — before the platform's 20th company.
--
-- The public ("anon") key ships inside the app and the website, so anything
-- the anon role may do, anyone on the internet may do. And anyone can create
-- an account, so anything every signed-in account may do to other people's
-- data is nearly as open. This closes what an outsider or a stranger's
-- account could reach; nothing the app itself does changes. Every policy
-- removed below is a looser duplicate of a stricter one that stays, checked
-- against the app's own queries.
--
-- Undo: supabase/rollback/20261027100000_security_lockdown_undo.sql

-- ---------------------------------------------------------------------------
-- 1. Storage, bucket `media`
--
-- Anyone could list the bucket, upload into it, overwrite or delete any file
-- (avatars, vehicle photos, drivers' ID cards and licences) without signing
-- in, and any signed-in account could do the same to everybody's files.
-- Now a signed-in user writes, replaces, deletes and lists only his own files
-- (the paths the app uploads to), an admin everything. Pictures still open by
-- their public link, which is how the app shows them.

drop policy if exists "allow anon insert media" on storage.objects;
drop policy if exists "allow anon select media" on storage.objects;
drop policy if exists "allow public uploads" on storage.objects;
drop policy if exists "Authenticated users can upload" on storage.objects;
drop policy if exists "Users can delete own files" on storage.objects;
drop policy if exists "Users can update own files" on storage.objects;
drop policy if exists "Anyone can view media" on storage.objects;
drop policy if exists "media_select" on storage.objects;
drop policy if exists "media_insert_own" on storage.objects;
drop policy if exists "media_update_own" on storage.objects;
drop policy if exists "media_delete_own" on storage.objects;

-- The app's paths (lib/mediaUpload.ts, lib/bookingOdometer.ts, lib/tourDayLogs.ts):
--   avatars/<uid>.jpg
--   verification/<uid>/<slot>.jpg   (and the older verifications/<uid>/…)
--   odometer/<uid>/<booking>/<phase>.jpg
--   vehicles/<vehicle id>/<angle>.jpg   (the vehicle is his) — older ones vehicles/<uid>/…
create or replace function public.media_path_is_mine(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    or (split_part(p_name, '/', 1) in ('verification', 'verifications', 'odometer')
        and split_part(p_name, '/', 2) = auth.uid()::text)
    or p_name ~ ('^avatars/' || auth.uid()::text || '\.[A-Za-z0-9]+$')
    or (split_part(p_name, '/', 1) = 'vehicles'
        and (split_part(p_name, '/', 2) = auth.uid()::text
             or exists (select 1
                          from public.vehicles v
                         where v.id::text = split_part(p_name, '/', 2)
                           and v.driver_id = auth.uid())))
  );
$$;

revoke all on function public.media_path_is_mine(text) from public, anon;
grant execute on function public.media_path_is_mine(text) to authenticated, service_role;

create policy media_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and public.media_path_is_mine(name));

create policy media_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.media_path_is_mine(name));

create policy media_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.media_path_is_mine(name))
  with check (bucket_id = 'media' and public.media_path_is_mine(name));

create policy media_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.media_path_is_mine(name));

-- ---------------------------------------------------------------------------
-- 2. Tables

-- profiles carries e-mail, birth date and push token: no longer readable
-- without signing in ("Profiles are viewable by everyone" stays for
-- signed-in users, which the app needs for names, photos and pushes).
drop policy if exists "Anyone can read profiles" on public.profiles;

-- Open bookings — client name and phone, hotel, flight, price — were
-- readable by anyone with the public key and by every company, and any
-- account could claim one and rewrite it. Drivers keep their own rules:
-- bookings_select_participants, bookings_update_driver_accept,
-- bookings_update_driver_reject_open and accept_booking_atomic().
drop policy if exists "Drivers see pending bookings" on public.bookings;
drop policy if exists "Drivers accept pending bookings" on public.bookings;

-- The old live-position table (empty, unused since driver_locations).
drop policy if exists "Anyone can see locations" on public.locations;

-- Any account could rate any driver with any score, which feeds dispatch.
-- Rating stays with the company of a completed booking (ratings_company_insert).
drop policy if exists "Companies create ratings" on public.ratings;

-- Any account could add a vehicle in another driver's name. A driver adds
-- his own ("Drivers manage own vehicle").
drop policy if exists "Allow Auth Insert Vehicles" on public.vehicles;
drop policy if exists "vehicles_authenticated_insert" on public.vehicles;

-- The receiver of a message could rewrite its text; he may only mark it read.
revoke update on public.messages from anon, authenticated;
grant update (is_read) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Functions

-- A company's own unrated trips — it could ask for any other company's.
create or replace function public.company_pending_reviews(p_company_id uuid default null)
returns table(booking_id uuid, driver_id uuid, driver_name text, route text, date_display text, completed_at timestamp with time zone)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    b.id,
    b.driver_id,
    coalesce(nullif(trim(b.driver_display_name), ''), u.full_name),
    public.booking_route_summary(b.from_location, b.to_location, b.route::text),
    b.date_display,
    b.completed_at
  from public.bookings b
  left join public.users u on u.id = b.driver_id
  where b.company_id = case
          when public.is_admin_user() then coalesce(p_company_id, auth.uid())
          else auth.uid()
        end
    and b.status = 'completed'
    and b.driver_id is not null
    and not exists (
      select 1 from public.ratings ra
       where ra.booking_id = b.id
         and ra.company_id = b.company_id
    )
  order by b.completed_at asc nulls last;
$function$;

-- Moving drivers to the back of the dispatch queue is the dispatching
-- company's call (lib/dispatchPushWaves.ts), not any account's.
create or replace function public.mark_drivers_dispatched(p_driver_ids uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.users
     set last_dispatched_at = now()
   where role = 'driver'
     and id = any (coalesce(p_driver_ids, array[]::uuid[]))
     and exists (
       select 1 from public.users me
        where me.id = auth.uid()
          and me.role in ('company', 'admin')
     );
$function$;

-- A tour's day plan (odometer photos, overnight places, costs, notes) is for
-- the people on that booking, not anyone who has its id.
create or replace function public.tour_day_plan(p_booking_id uuid)
returns table(day_index integer, day_date date, from_place text, to_place text, stops text, planned_overnight text, is_closed boolean, can_close boolean, closed_at timestamp with time zone, odometer_value numeric, odometer_photo_url text, overnight_place text, extra_costs_gel numeric, note text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  b record;
  n integer;
  i integer;
  td jsonb;
  it jsonb;
  d_date date;
  log record;
  prev_closed boolean := true;
  day_started boolean;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return;
  end if;

  if auth.uid() is null
     or not (
       b.driver_id = auth.uid()
       or b.host_driver_id = auth.uid()
       or b.company_id = auth.uid()
       or public.is_admin_user()
     ) then
    return;
  end if;

  n := public.tour_day_count(p_booking_id);

  for i in 1..n loop
    td := coalesce(b.tour_days, '[]'::jsonb) -> (i - 1);
    it := coalesce(b.itinerary, '[]'::jsonb) -> (i - 1);

    d_date := null;
    if td is not null and (td ->> 'date') is not null then
      begin
        d_date := (td ->> 'date')::date;
      exception when others then
        d_date := null;
      end;
    end if;
    if d_date is null then
      -- fall back to counting forward from the tour start
      d_date := (public.parse_booking_start_ts(b.date_display)
                   at time zone 'Asia/Tbilisi')::date + (i - 1);
    end if;

    select * into log
      from public.booking_day_logs l
     where l.booking_id = p_booking_id and l.day_index = i;

    day_index := i;
    day_date := d_date;
    from_place := coalesce(td ->> 'fromPlace', it ->> 'from');
    to_place := coalesce(td ->> 'toPlace', it ->> 'to');
    stops := coalesce(td ->> 'stops', it ->> 'stops');
    planned_overnight := td ->> 'driverOvernight';

    is_closed := log.id is not null;
    closed_at := log.closed_at;
    odometer_value := log.odometer_value;
    odometer_photo_url := log.odometer_photo_url;
    overnight_place := log.overnight_place;
    extra_costs_gel := log.extra_costs_gel;
    note := log.note;

    -- a day can be closed once its own date has started and the day before it
    -- is already closed; days are closed in order, never out of sequence
    day_started := d_date is null
                   or now() >= (d_date::timestamp at time zone 'Asia/Tbilisi');
    can_close := (not is_closed)
                 and prev_closed
                 and day_started
                 and b.status = 'in_progress';

    prev_closed := is_closed;
    return next;
  end loop;
end;
$function$;

-- SECURITY DEFINER functions run with the owner's rights. Postgres lets
-- everyone (PUBLIC) execute a new function, so all of them answered the
-- anon key — admin and dispatch functions included (most check the caller
-- inside, but none of them is meant for someone who has not signed in).
-- Signed-in users keep exactly the functions they could call before.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_could
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
    if r.auth_could then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end
$$;

-- Run only by the database itself (cron, triggers) — never by the app.
revoke execute on function public.alert_undispatched_bookings() from authenticated;
revoke execute on function public.dispatch_due_second_waves() from authenticated;
revoke execute on function public.dispatch_debug(uuid) from authenticated;
revoke execute on function public.dispatch_new_booking_push(uuid, integer) from authenticated;
revoke execute on function public.find_replacement_driver_for_booking(uuid, uuid) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.guard_profiles_privileged_columns() from authenticated;
revoke execute on function public.guard_users_privileged_columns() from authenticated;
revoke execute on function public.sync_driver_profile() from authenticated;
revoke execute on function public.sync_profile_on_vehicle_change() from authenticated;
revoke execute on function public.sync_push_token_to_profiles() from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Drivers' documents — ID card, driving licence, tech passport — in a
--    private bucket.
--
-- They sat in the public bucket, where a link opens them for anyone, and a
-- link is easy to build from a user id. The app now uploads them here and
-- shows them through signed links that expire within the hour
-- (lib/documentStorage.ts). Only the driver himself and an admin may read or
-- replace them. The files already uploaded are moved here afterwards.
-- No size limit, like `media`: phone photos of documents reach 18 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, null, array['image/*'])
on conflict (id) do update set public = false;

create or replace function public.document_path_is_mine(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    or (split_part(p_name, '/', 1) in ('verification', 'verifications')
        and split_part(p_name, '/', 2) = auth.uid()::text)
    or (split_part(p_name, '/', 1) = 'vehicles'
        and (split_part(p_name, '/', 2) = auth.uid()::text
             or exists (select 1
                          from public.vehicles v
                         where v.id::text = split_part(p_name, '/', 2)
                           and v.driver_id = auth.uid())))
  );
$$;

revoke all on function public.document_path_is_mine(text) from public, anon;
grant execute on function public.document_path_is_mine(text) to authenticated, service_role;

create policy documents_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.document_path_is_mine(name));

create policy documents_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.document_path_is_mine(name));

create policy documents_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.document_path_is_mine(name))
  with check (bucket_id = 'documents' and public.document_path_is_mine(name));

create policy documents_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.document_path_is_mine(name));

-- ---------------------------------------------------------------------------
-- 5. profiles: e-mail and birth date are nobody else's business.
--
-- Every signed-in account could read every profile's e-mail and birth date.
-- The other columns stay readable (names, photos, push tokens — the app needs
-- them); those two only through the owner's own function.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, vehicle_type, vehicle_class, push_token, created_at, is_verified, languages, avatar_url)
  on public.profiles to authenticated;

create or replace function public.my_birth_date()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select p.birth_date from public.profiles p where p.id = auth.uid();
$$;

revoke all on function public.my_birth_date() from public, anon;
grant execute on function public.my_birth_date() to authenticated, service_role;

-- Saving it: an upsert of birth_date would now be refused (ON CONFLICT DO
-- UPDATE reads the column), so the app saves one's own date through this.
create or replace function public.set_my_birth_date(p_birth_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.profiles (id, birth_date)
  values (auth.uid(), p_birth_date)
  on conflict (id) do update set birth_date = excluded.birth_date;
end;
$$;

revoke all on function public.set_my_birth_date(date) from public, anon;
grant execute on function public.set_my_birth_date(date) to authenticated, service_role;

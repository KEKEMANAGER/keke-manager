-- What the company could not see during the first certified tour:
--
--   1. trip_events — the driver marks "passengers picked up" and "passengers
--      dropped off" for every leg and every day, with the time and the place.
--      The phone keeps a mark made without internet and sends it later with
--      the real time (client_event_id makes the retry safe).
--   2. driver_location_trail — the route the phone recorded, also where it had
--      no internet; uploaded when the connection returns, so the company sees
--      the day's road instead of a pin that froze in the mountains.
--   3. watch_trip_gps() — a trip whose phone went quiet: first a silent push
--      that wakes the app to report and restart its GPS, then, if it stays
--      quiet, a notification to the driver.

-- ─── 1. trip events ──────────────────────────────────────────────────────────

create table if not exists public.trip_events (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  driver_id       uuid not null references public.users(id) on delete cascade,
  kind            text not null check (kind in ('pickup', 'dropoff')),
  happened_at     timestamptz not null,
  latitude        double precision,
  longitude       double precision,
  place_label     text,
  client_event_id text not null,
  created_at      timestamptz not null default now(),
  constraint trip_events_client_unique unique (driver_id, client_event_id)
);

create index if not exists trip_events_booking_idx on public.trip_events (booking_id, happened_at);

comment on table public.trip_events is
  'Passengers picked up / dropped off, marked by the driver on the GPS screen (app/(driver)/gps.tsx).';

alter table public.trip_events enable row level security;

drop policy if exists trip_events_driver_insert on public.trip_events;
create policy trip_events_driver_insert on public.trip_events
  for insert to authenticated
  with check (
    driver_id = auth.uid()
    and exists (
      select 1 from public.bookings b
       where b.id = trip_events.booking_id
         and (b.driver_id = auth.uid() or b.host_driver_id = auth.uid())
    )
  );

drop policy if exists trip_events_driver_read on public.trip_events;
create policy trip_events_driver_read on public.trip_events
  for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.bookings b
       where b.id = trip_events.booking_id
         and (b.driver_id = auth.uid() or b.host_driver_id = auth.uid())
    )
  );

drop policy if exists trip_events_company_read on public.trip_events;
create policy trip_events_company_read on public.trip_events
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = trip_events.booking_id
         and b.company_id = auth.uid()
    )
  );

drop policy if exists trip_events_admin_read on public.trip_events;
create policy trip_events_admin_read on public.trip_events
  for select to authenticated
  using (public.is_admin_user());

-- The company's booking card updates the moment the driver marks one.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_events'
     ) then
    execute 'alter publication supabase_realtime add table public.trip_events';
  end if;
end
$$;

-- ─── 2. the route ────────────────────────────────────────────────────────────

create table if not exists public.driver_location_trail (
  id          bigint generated always as identity primary key,
  driver_id   uuid not null references public.users(id) on delete cascade,
  booking_id  uuid references public.bookings(id) on delete cascade,
  recorded_at timestamptz not null,
  latitude    double precision not null,
  longitude   double precision not null,
  created_at  timestamptz not null default now(),
  constraint driver_location_trail_point_unique unique (driver_id, recorded_at)
);

create index if not exists driver_location_trail_booking_idx
  on public.driver_location_trail (booking_id, recorded_at);
create index if not exists driver_location_trail_recorded_idx
  on public.driver_location_trail (recorded_at);

comment on table public.driver_location_trail is
  'Where the driver''s phone was during a trip, about every 30 s (lib/locationTrail.ts). Kept 30 days.';

alter table public.driver_location_trail enable row level security;

drop policy if exists driver_location_trail_driver_insert on public.driver_location_trail;
create policy driver_location_trail_driver_insert on public.driver_location_trail
  for insert to authenticated
  with check (
    driver_id = auth.uid()
    and (
      booking_id is null
      or exists (
        select 1 from public.bookings b
         where b.id = driver_location_trail.booking_id
           and (b.driver_id = auth.uid() or b.host_driver_id = auth.uid())
      )
    )
  );

drop policy if exists driver_location_trail_driver_read on public.driver_location_trail;
create policy driver_location_trail_driver_read on public.driver_location_trail
  for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  for select to authenticated
  using (
    booking_id is not null
    and exists (
      select 1 from public.bookings b
       where b.id = driver_location_trail.booking_id
         and b.company_id = auth.uid()
    )
  );

drop policy if exists driver_location_trail_fleet_host_read on public.driver_location_trail;
create policy driver_location_trail_fleet_host_read on public.driver_location_trail
  for select to authenticated
  using (
    exists (
      select 1 from public.driver_fleet f
       where f.host_driver_id = auth.uid()
         and f.sub_driver_id = driver_location_trail.driver_id
         and f.status = 'accepted'
    )
  );

drop policy if exists driver_location_trail_admin_read on public.driver_location_trail;
create policy driver_location_trail_admin_read on public.driver_location_trail
  for select to authenticated
  using (public.is_admin_user());

-- ─── 3. a trip whose GPS went quiet ──────────────────────────────────────────

-- A push with no title and no text: Android hands it to the app's background
-- task (lib/gpsWake.native.ts) without showing anything.
create or replace function public.send_expo_silent_push(p_token text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t text := trim(coalesce(p_token, ''));
begin
  if t = '' or not (t like 'ExponentPushToken%' or t like 'ExpoPushToken%') then
    return;
  end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := jsonb_build_object(
      'to', t,
      'data', coalesce(p_data, '{}'::jsonb),
      'priority', 'high',
      '_contentAvailable', true
    )
  );
end;
$function$;

create table if not exists public.trip_gps_watch (
  driver_id      uuid primary key references public.users(id) on delete cascade,
  booking_id     uuid,
  quiet_since    timestamptz,
  silent_sent_at timestamptz,
  silent_count   int not null default 0,
  alert_sent_at  timestamptz,
  alert_count    int not null default 0
);

comment on table public.trip_gps_watch is
  'One row per driver whose trip GPS is quiet right now: what watch_trip_gps() already did about it.';

-- Only watch_trip_gps() touches it.
alter table public.trip_gps_watch enable row level security;

create or replace function public.watch_trip_gps()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r            record;
  w            public.trip_gps_watch%rowtype;
  tok          text;
  tbilisi_hour int := extract(hour from (now() at time zone 'Asia/Tbilisi'));
  acted        int := 0;
begin
  for r in
    select distinct on (b.driver_id)
           b.driver_id, b.id as booking_id, dl.updated_at as loc_at
      from public.bookings b
      join public.driver_locations dl on dl.driver_id = b.driver_id
     where b.status = 'in_progress'
       and b.driver_id is not null
       -- He chose to be located only while the app is open: respected.
       and coalesce(dl.gps_mode, 'background') <> 'foreground'
     order by b.driver_id, b.updated_at desc
  loop
    -- Live: nothing to do, and a spell that was going on is over.
    if r.loc_at > now() - interval '10 minutes' then
      delete from public.trip_gps_watch where driver_id = r.driver_id;
      continue;
    end if;

    select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    if not found or w.quiet_since is distinct from r.loc_at then
      insert into public.trip_gps_watch (driver_id, booking_id, quiet_since)
      values (r.driver_id, r.booking_id, r.loc_at)
      on conflict (driver_id) do update
        set booking_id     = excluded.booking_id,
            quiet_since    = excluded.quiet_since,
            silent_sent_at = null,
            silent_count   = 0,
            alert_sent_at  = null,
            alert_count    = 0;
      select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    end if;

    tok := public.fetch_user_push_token(r.driver_id);

    -- 1) Wake the app without showing anything: it reports where it is and
    --    restarts the trip's GPS. Every 10 minutes, at most 6 times a spell.
    if tok is not null
       and w.silent_count < 6
       and (w.silent_sent_at is null or w.silent_sent_at < now() - interval '10 minutes') then
      perform public.send_expo_silent_push(
        tok,
        jsonb_build_object('type', 'gps_wake', 'booking_id', r.booking_id::text)
      );
      update public.trip_gps_watch
         set silent_sent_at = now(), silent_count = silent_count + 1
       where driver_id = r.driver_id;
      acted := acted + 1;
    end if;

    -- 2) Still quiet after 20 minutes: tell the driver. By day only, at most
    --    every two hours and three times a spell.
    if r.loc_at < now() - interval '20 minutes'
       and tbilisi_hour between 8 and 21
       and w.alert_count < 3
       and (w.alert_sent_at is null or w.alert_sent_at < now() - interval '2 hours') then
      perform public.booking_notify(
        r.driver_id,
        'KEKE · GPS',
        'GPS გაჩერდა. გახსენი KEKE Manager, რომ კომპანიამ რუკაზე დაგინახოს.',
        'gps_stopped',
        jsonb_build_object('type', 'gps_stopped', 'booking_id', r.booking_id::text)
      );
      update public.trip_gps_watch
         set alert_sent_at = now(), alert_count = alert_count + 1
       where driver_id = r.driver_id;
      acted := acted + 1;
    end if;
  end loop;

  -- Trips that ended take their spell with them.
  delete from public.trip_gps_watch g
   where not exists (
     select 1 from public.bookings b
      where b.driver_id = g.driver_id and b.status = 'in_progress'
   );

  return acted;
end;
$function$;

revoke all on function public.send_expo_silent_push(text, jsonb) from public, anon, authenticated;
grant execute on function public.send_expo_silent_push(text, jsonb) to service_role;
revoke all on function public.watch_trip_gps() from public, anon, authenticated;
grant execute on function public.watch_trip_gps() to service_role;

-- The schedule is in 20261028120100_watch_trip_gps_cron.sql: it goes live
-- together with the app version that answers the silent push.

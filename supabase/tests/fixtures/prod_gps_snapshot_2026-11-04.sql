-- Read-only snapshot of the PRODUCTION objects behind driver GPS and live
-- tracking that the GPS P0 tests need, on top of the lifecycle, reminders,
-- P0-3 and P0-4 snapshots and the migrations production has run since
-- (P0-1 .. P0-6, the vehicle calendar, fleet invites, import approvals and the
-- day tour; supabase/tests/run_gps_p0_tests.sh builds them in that order).
-- Captured on 2026-11-04 from the live catalog of project brrjuxgxmpgvkddcuaad
-- with SELECT queries only. Schema only: no rows, no positions, no tokens, no
-- secrets.
--
--   * tables driver_locations, driver_location_trail, trip_events,
--     trip_gps_watch, the unused legacy locations, and booking_day_logs (only
--     its columns and key: complete_in_progress_booking_as_driver counts its
--     rows), with their constraints, indexes, row-level security rules and
--     grants as production has them
--   * watch_trip_gps (md5 of pg_get_functiondef 404c16209b42db87e6c4052a2091c143),
--     send_expo_silent_push (681bce7f8481ecd354a4a3cea48ad91e),
--     trip_events_queue_company_email (c596662a24a67066ee549c6d7cc56cb5) and
--     its trigger, tour_day_count (6e3113423fdca8165ebb9340e97a06de) and
--     complete_in_progress_booking_as_driver (856a9c7e036b172824151eb1360a4949),
--     the app's "finish the trip" call, each with production's execute rights
--     (the runner first gives anon and authenticated execute on every new
--     function in public, as Supabase does, so these revokes matter)
--   * a stand-in for pg_cron's job table holding production's two GPS jobs
--     (watch-trip-gps every 2 minutes, trail-cleanup daily), so a migration's
--     scheduling can be checked; nothing runs on a schedule here
--
-- Function bodies are as in production with line endings normalised to LF.
-- A TEST FIXTURE, not a migration.
set check_function_bodies = off;

-- ===================================================== tables
create table public.driver_locations (
  driver_id uuid not null,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamp with time zone default now() not null,
  gps_mode text,
  gps_mode_at timestamp with time zone,
  constraint driver_locations_pkey primary key (driver_id),
  constraint driver_locations_driver_id_fkey foreign key (driver_id) references auth.users(id) on delete cascade,
  constraint driver_locations_gps_mode_check check ((gps_mode = any (array['background'::text, 'foreground'::text])))
);

create table public.driver_location_trail (
  id bigint generated always as identity not null,
  driver_id uuid not null,
  booking_id uuid,
  recorded_at timestamp with time zone not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamp with time zone default now() not null,
  constraint driver_location_trail_pkey primary key (id),
  constraint driver_location_trail_point_unique unique (driver_id, recorded_at),
  constraint driver_location_trail_booking_id_fkey foreign key (booking_id) references public.bookings(id) on delete cascade,
  constraint driver_location_trail_driver_id_fkey foreign key (driver_id) references public.users(id) on delete cascade
);
create index driver_location_trail_booking_idx on public.driver_location_trail using btree (booking_id, recorded_at);
create index driver_location_trail_recorded_idx on public.driver_location_trail using btree (recorded_at);

create table public.trip_events (
  id uuid default gen_random_uuid() not null,
  booking_id uuid not null,
  driver_id uuid not null,
  kind text not null,
  happened_at timestamp with time zone not null,
  latitude double precision,
  longitude double precision,
  place_label text,
  client_event_id text not null,
  created_at timestamp with time zone default now() not null,
  constraint trip_events_pkey primary key (id),
  constraint trip_events_client_unique unique (driver_id, client_event_id),
  constraint trip_events_kind_check check ((kind = any (array['pickup'::text, 'dropoff'::text]))),
  constraint trip_events_booking_id_fkey foreign key (booking_id) references public.bookings(id) on delete cascade,
  constraint trip_events_driver_id_fkey foreign key (driver_id) references public.users(id) on delete cascade
);
create index trip_events_booking_idx on public.trip_events using btree (booking_id, happened_at);

create table public.trip_gps_watch (
  driver_id uuid not null,
  booking_id uuid,
  quiet_since timestamp with time zone,
  silent_sent_at timestamp with time zone,
  silent_count integer default 0 not null,
  alert_sent_at timestamp with time zone,
  alert_count integer default 0 not null,
  constraint trip_gps_watch_pkey primary key (driver_id),
  constraint trip_gps_watch_driver_id_fkey foreign key (driver_id) references public.users(id) on delete cascade
);

create table public.locations (
  id uuid default gen_random_uuid() not null,
  driver_id uuid,
  booking_id uuid,
  latitude numeric not null,
  longitude numeric not null,
  heading numeric,
  speed numeric,
  is_active boolean default true,
  updated_at timestamp with time zone default now(),
  constraint locations_pkey primary key (id),
  constraint locations_booking_id_fkey foreign key (booking_id) references public.bookings(id),
  constraint locations_driver_id_fkey foreign key (driver_id) references public.users(id)
);

create table public.booking_day_logs (
  id uuid default gen_random_uuid() not null,
  booking_id uuid not null,
  day_index integer not null,
  day_date date,
  driver_id uuid,
  closed_at timestamp with time zone default now() not null,
  odometer_value numeric,
  odometer_photo_url text,
  overnight_place text,
  extra_costs_gel numeric,
  note text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint booking_day_logs_pkey primary key (id)
);

alter table public.driver_locations enable row level security;
alter table public.driver_location_trail enable row level security;
alter table public.trip_events enable row level security;
alter table public.trip_gps_watch enable row level security;
alter table public.locations enable row level security;
alter table public.booking_day_logs enable row level security;

-- ===================================================== row-level security (as production)
create policy driver_locations_admin_read on public.driver_locations as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));

create policy driver_locations_company_booking_read on public.driver_locations as permissive for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'company'::text)))) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.company_id = auth.uid()) AND (b.driver_id = driver_locations.driver_id) AND (b.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])) AND (b.driver_id IS NOT NULL))))));

create policy driver_locations_fleet_host_read on public.driver_locations as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM driver_fleet f
  WHERE ((f.host_driver_id = auth.uid()) AND (f.sub_driver_id = driver_locations.driver_id) AND (f.status = 'accepted'::text)))));

create policy driver_locations_self on public.driver_locations as permissive for all to public
  using ((auth.uid() = driver_id))
  with check ((auth.uid() = driver_id));

create policy driver_location_trail_admin_read on public.driver_location_trail as permissive for select to authenticated
  using (is_admin_user());

create policy driver_location_trail_company_read on public.driver_location_trail as permissive for select to authenticated
  using (((booking_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_location_trail.booking_id) AND (b.company_id = auth.uid()))))));

create policy driver_location_trail_driver_insert on public.driver_location_trail as permissive for insert to authenticated
  with check (((driver_id = auth.uid()) AND ((booking_id IS NULL) OR (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_location_trail.booking_id) AND ((b.driver_id = auth.uid()) OR (b.host_driver_id = auth.uid()))))))));

create policy driver_location_trail_driver_read on public.driver_location_trail as permissive for select to authenticated
  using ((driver_id = auth.uid()));

create policy driver_location_trail_fleet_host_read on public.driver_location_trail as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM driver_fleet f
  WHERE ((f.host_driver_id = auth.uid()) AND (f.sub_driver_id = driver_location_trail.driver_id) AND (f.status = 'accepted'::text)))));

create policy trip_events_admin_read on public.trip_events as permissive for select to authenticated
  using (is_admin_user());

create policy trip_events_company_read on public.trip_events as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = trip_events.booking_id) AND (b.company_id = auth.uid())))));

create policy trip_events_driver_insert on public.trip_events as permissive for insert to authenticated
  with check (((driver_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = trip_events.booking_id) AND ((b.driver_id = auth.uid()) OR (b.host_driver_id = auth.uid())))))));

create policy trip_events_driver_read on public.trip_events as permissive for select to authenticated
  using (((driver_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = trip_events.booking_id) AND ((b.driver_id = auth.uid()) OR (b.host_driver_id = auth.uid())))))));

create policy "Drivers manage own location" on public.locations as permissive for all to public
  using ((auth.uid() = driver_id))
  with check ((auth.uid() = driver_id));

-- trip_gps_watch: row-level security on, no rules (the server's own table).

-- ===================================================== grants (as production)
grant all on public.driver_locations, public.driver_location_trail, public.trip_events,
             public.trip_gps_watch, public.locations, public.booking_day_logs
  to anon, authenticated, service_role;
grant usage, select on sequence public.driver_location_trail_id_seq to anon, authenticated, service_role;

-- ===================================================== functions
CREATE OR REPLACE FUNCTION public.send_expo_silent_push(p_token text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
revoke all on function public.send_expo_silent_push(text, jsonb) from public, anon, authenticated;
grant execute on function public.send_expo_silent_push(text, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.watch_trip_gps()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       -- A trip quiet for half a day is one left open, not a GPS that just
       -- stopped: nobody is told about that one.
       and dl.updated_at > now() - interval '12 hours'
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
revoke all on function public.watch_trip_gps() from public, anon, authenticated;
grant execute on function public.watch_trip_gps() to service_role;

CREATE OR REPLACE FUNCTION public.trip_events_queue_company_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.kind not in ('pickup', 'dropoff') then
    return null;
  end if;
  perform public.queue_booking_email(new.booking_id, new.kind, new.driver_id, new.kind || ':' || new.id::text,
    jsonb_build_object('happened_at', new.happened_at, 'place', new.place_label,
                       'lat', new.latitude, 'lng', new.longitude));
  return null;
exception when others then
  raise warning 'trip email not queued for %: %', new.booking_id, sqlerrm;
  return null;
end;
$function$;

CREATE TRIGGER trip_events_queue_company_email AFTER INSERT ON public.trip_events FOR EACH ROW EXECUTE FUNCTION trip_events_queue_company_email();

CREATE OR REPLACE FUNCTION public.tour_day_count(p_booking_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select greatest(
    1,
    coalesce(
      nullif(jsonb_array_length(coalesce(b.tour_days, '[]'::jsonb)), 0),
      nullif(jsonb_array_length(coalesce(b.itinerary, '[]'::jsonb)), 0),
      1
    )
  )
  from public.bookings b
  where b.id = p_booking_id;
$function$;
revoke all on function public.tour_day_count(uuid) from public, anon;
grant execute on function public.tour_day_count(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_in_progress_booking_as_driver(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  updated_id uuid;
  n integer;
  closed_count integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  n := public.tour_day_count(p_booking_id);
  if n > 1 then
    select count(*) into closed_count
      from public.booking_day_logs where booking_id = p_booking_id;
    if closed_count < n then
      raise exception 'TOUR_DAYS_OPEN: ჯერ ყველა დღე დახურე — დახურულია %/%', closed_count, n
        using errcode = 'P0001';
    end if;
  end if;

  update public.bookings b
     set status = 'completed',
         updated_at = now()
   where b.id = p_booking_id
     and b.status = 'in_progress'
     and (lower(trim(b.driver_id::text)) = lower(uid::text) or b.host_driver_id = uid)
  returning b.id into updated_id;

  return updated_id is not null;
end;
$function$;
revoke all on function public.complete_in_progress_booking_as_driver(uuid) from public, anon;
grant execute on function public.complete_in_progress_booking_as_driver(uuid) to authenticated, service_role;

-- ===================================================== pg_cron stand-in
-- Production has the pg_cron extension. Here: its job table and
-- schedule/unschedule with the same signatures and the same "a name that
-- exists is updated" rule, holding production's two GPS jobs. Nothing runs.
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport integer not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text
);
create unique index if not exists job_jobname_username_uniq on cron.job (jobname, username);

create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  update cron.job set schedule = $2, command = $3, active = true
   where jobname = job_name and username = current_user
  returning jobid into v;
  if v is null then
    insert into cron.job (jobname, schedule, command) values (job_name, $2, $3) returning jobid into v;
  end if;
  return v;
end;
$$;

create or replace function cron.unschedule(job_name text) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobname = job_name and username = current_user;
  if not found then
    raise exception 'could not find valid entry for job ''%''', job_name;
  end if;
  return true;
end;
$$;

insert into cron.job (jobname, schedule, command) values
  ('watch-trip-gps', '*/2 * * * *', 'select public.watch_trip_gps();'),
  ('trail-cleanup', '17 3 * * *', 'delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';');

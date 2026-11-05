-- Fake accounts, cars and bookings for the smart-dispatch tests (no real data,
-- no real tokens: every token is "ExponentPushToken[sd-<name>]", and
-- net.http_post is the shim's recorder, so nothing leaves the machine).
-- Included by the test files; runs as the database owner inside the test's
-- transaction, which is rolled back at the end. Ids are tests.sd('<name>').
-- Works before and after 20261105120000_smart_dispatch.sql (the bug
-- reproduction runs on production as it is).
--
-- Drivers (all approved, verified, an approved active car, a phone; city
-- Tbilisi unless said otherwise; jobs start at Tbilisi airport):
--   E_LOC   economy minivan 3-5, English            exact match, works there
--   E_FAR   economy minivan 3-5, English, Batumi    exact match, elsewhere
--   C_LOC   comfort minivan 3-5, English            economy jobs: widened only
--   C_FAR   comfort minivan 3-5, English, Batumi    economy jobs: widened only
--   V_LOC   VIP minivan 3-5, English                economy jobs: never
--   B_LOC   business minivan 3-5, English           economy jobs: never (VIP in the app)
--   E_BIG   economy minivan 6-8, English            a 3-5 job: widened only
--   W_ALL   comfort minivan 6-8, no language        widened by class, seats and language at once
--   E_NOL   economy minivan 3-5, languages {}       an English job: widened only
--   E_NUL   economy minivan 3-5, languages null     an English job: widened only
--   E_RU    economy minivan 3-5, Russian only       an English job: never
--   E_DEC   economy minivan 3-5, English            declines ECO
--   C_DEC   comfort minivan 3-5, English            declines ECO
--   E_BSY   economy minivan 3-5, English            his calendar is closed at ECO's time
--   C_BSY   comfort minivan 3-5, no language        his calendar is closed at ECO's time
--   E_UNA   economy minivan 3-5, English            account NOT approved by KEKE
--   E_BLK   economy minivan 3-5, no language        blocked
--   E_OFF   economy minivan 3-5, English            his car switched off
--   E_CUA   economy minivan 3-5, English            his car not approved
--   HIRED   economy minivan 3-5, English            hired driver (job board)
--   HOST    economy minivan 3-5 (vHOST), English    fleet owner
--   SUB     no car of his own, drives vHOST, English, accepted fleet link
--   G_ECO   economy minivan 3-5, English            guide driver
--   S_ECO   economy sedan, English                  the push-text job
--   MB10 MB13 MB16 MB18  economy microbuses of 10/13/16/18 seats, English
-- Others: C1 (company), ADM (admin).
-- Bookings (C1's, open, transfers from Tbilisi airport two days from now):
--   ECO       economy minivan 3-5, English, 5 passengers (the 5 Nov case)
--   ECO_ANY   economy minivan, no tier, no language
--   ECO68     economy minivan 6-8, 4 passengers (a 3-5 would seat them, but is smaller than asked)
--   COMF      comfort minivan, no tier, no language
--   VIP       VIP minivan
--   MB13      economy microbus 13, 12 passengers
--   MB13X     economy microbus 13, 17 passengers (a 16-seater is too small)
--   GUIDE     economy minivan 3-5, English, a guide asked for
--   OFFER     economy minivan 3-5 offered to E_LOC by name
--   FMT       economy sedan Tbilisi Airport -> Kazbegi, 2026-11-06T06:00:00.000Z
--   APP       economy minivan 3-5, English (the app's ordered waves)

create schema if not exists tests;
grant usage on schema tests to public;

-- Act as a signed-in user, the way PostgREST does it.
create or replace function tests.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local session authorization authenticator';
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.act_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local session authorization authenticator';
  execute 'set local role anon';
end;
$$;

create or replace function tests.act_as_owner() returns void
language plpgsql as $$
begin
  execute 'reset session authorization';
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- The value one query returns as text, or 'denied' (42501) / 'error'.
create or replace function tests.try_value(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then
    return 'denied';
  when others then
    raise notice 'try_value: % %', sqlstate, sqlerrm;
    return 'error';
end;
$$;

-- The SQLSTATE a statement fails with, or 'ok'.
create or replace function tests.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

create or replace function tests.sd(p_name text) returns uuid
language sql immutable as $$
  select md5('keke-smart-dispatch-test:' || p_name)::uuid
$$;

create or replace function tests.sd_tok(p_name text) returns text
language sql immutable as $$
  select 'ExponentPushToken[sd-' || p_name || ']'
$$;

-- Every seeded driver, by name.
create or replace function tests.sd_drivers() returns text[]
language sql immutable as $$
  select array['E_LOC','E_FAR','C_LOC','C_FAR','V_LOC','B_LOC','E_BIG','W_ALL','E_NOL','E_NUL','E_RU',
               'E_DEC','C_DEC','E_BSY','C_BSY','E_UNA','E_BLK','E_OFF','E_CUA','HIRED','HOST','SUB',
               'G_ECO','S_ECO','MB10','MB13','MB16','MB18']
$$;

create or replace function tests.sd_name(p_id uuid) returns text
language sql stable as $$
  select n from unnest(tests.sd_drivers() || array['C1','ADM']) n where tests.sd(n) = p_id
$$;

-- Names of a set of drivers, sorted, comma-separated.
create or replace function tests.sd_names(p_ids uuid[]) returns text
language sql stable as $$
  select coalesce(string_agg(tests.sd_name(i), ',' order by tests.sd_name(i)), '') from unnest(p_ids) i
$$;

-- Who has an in-app new-job notice for a booking (in any wave).
create or replace function tests.sd_told(p_booking text) returns text
language sql security definer set search_path = public as $$
  select tests.sd_names(array_agg(distinct n.user_id))
    from public.notifications n
   where n.type = 'new_booking' and n.data ->> 'booking_id' = tests.sd(p_booking)::text
$$;

-- How many new-job notices one driver has for a booking.
create or replace function tests.sd_notices(p_driver text, p_booking text) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.notifications n
   where n.user_id = tests.sd(p_driver) and n.type = 'new_booking'
     and n.data ->> 'booking_id' = tests.sd(p_booking)::text
$$;

-- The admin's no-driver alerts for a booking.
create or replace function tests.sd_alerts(p_booking text) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.notifications n
   where n.user_id = tests.sd('ADM') and n.type = 'dispatch_alert'
     and n.data ->> 'booking_id' = tests.sd(p_booking)::text
$$;

create or replace function tests.sd_alert_text(p_booking text) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(n.title || ' | ' || n.body, ' || ' order by n.created_at), '')
    from public.notifications n
   where n.user_id = tests.sd('ADM') and n.type = 'dispatch_alert'
     and n.data ->> 'booking_id' = tests.sd(p_booking)::text
$$;

-- The texts that reached one phone (recorded by the shim's net.http_post),
-- about one booking when it is named.
create or replace function tests.sd_push_texts(p_name text, p_booking text default null) returns text
language sql security definer set search_path = public, net as $$
  select coalesce(string_agg(coalesce(c.body ->> 'title', '') || ' | ' || coalesce(c.body ->> 'body', ''), ' || ' order by c.id), '')
    from net.http_calls c
   where c.url like 'https://exp.host/%' and c.body ->> 'to' = tests.sd_tok(p_name)
     and (p_booking is null or c.body -> 'data' ->> 'booking_id' = tests.sd(p_booking)::text)
$$;

-- Make p_minutes go by for the given bookings (all when null): every stored
-- time of theirs moves that far into the past, and so do their notices,
-- waiting pushes and dispatch log rows. Inside one transaction now() does
-- not move; this is how a test waits. Columns that do not exist yet (before
-- the migration) are skipped.
create or replace function tests.sd_advance(p_minutes int, p_bookings text[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  d    interval := make_interval(mins => p_minutes);
  ids  uuid[];
  sets text;
begin
  if p_bookings is not null then
    select array_agg(tests.sd(x)) into ids from unnest(p_bookings) x;
  end if;
  select string_agg(format('%1$I = %1$I - %2$L::interval', c.column_name, d), ', ') into sets
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'bookings'
     and c.column_name in ('created_at', 'dispatch_fallback_sent_at', 'dispatch_wave2_due_at', 'dispatch_alert_sent_at',
                           'dispatch_launched_at', 'dispatch_wave3_due_at', 'dispatch_wave3_sent_at');
  execute format('update public.bookings set %s where $1 is null or id = any ($1)', sets) using ids;
  update public.notifications set created_at = created_at - d
   where ids is null or (data ->> 'booking_id')::uuid = any (ids);
  update public.push_outbox set send_after = send_after - d, created_at = created_at - d, sent_at = sent_at - d
   where ids is null or booking_id = any (ids);
  update public.dispatch_log set created_at = created_at - d
   where ids is null or booking_id = any (ids);
end;
$$;

-- When the trips start: two days from now, as the app stores it (UTC, ms, Z).
create or replace function tests.sd_start(p_hours int default 48) returns text
language sql stable as $$
  select to_char((now() + make_interval(hours => p_hours)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"')
$$;

grant execute on all functions in schema tests to public;

-- people ---------------------------------------------------------------------
insert into auth.users (id, email)
select tests.sd(x), 'sd-' || lower(x) || '@test.invalid'
  from unnest(tests.sd_drivers() || array['C1', 'ADM']) x;

insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status,
                          is_blocked, is_available, is_hired_driver, available_for_hire, is_guide_driver,
                          city, languages)
select tests.sd(x),
       case x when 'C1' then 'company' when 'ADM' then 'admin' else 'driver' end,
       'Test ' || x,
       case when x = 'C1' then 'Test Tours SD' end,
       'sd-' || lower(x) || '@test.invalid',
       x <> 'E_UNA',
       case when x = 'E_UNA' then 'pending' else 'approved' end,
       x = 'E_BLK',
       true,
       x = 'HIRED',
       true,
       x = 'G_ECO',
       case when x in ('E_FAR', 'C_FAR') then 'Batumi' else 'Tbilisi' end,
       case
         when x in ('W_ALL', 'E_NOL', 'C_BSY', 'E_BLK') then array[]::text[]
         when x = 'E_NUL' then null
         when x = 'E_RU' then array['ru']
         when x in ('C1', 'ADM') then null
         else array['en']
       end
  from unnest(tests.sd_drivers() || array['C1', 'ADM']) x;

-- each phone registers the way every app version does: its token on the profile
insert into public.profiles (id, full_name, is_verified, push_token, languages)
select tests.sd(x), 'Test ' || x, x <> 'E_UNA', tests.sd_tok(x),
       case
         when x in ('W_ALL', 'E_NOL', 'C_BSY', 'E_BLK', 'E_NUL') then array[]::text[]
         when x = 'E_RU' then array['ru']
         when x in ('C1', 'ADM') then array[]::text[]
         else array['en']
       end
  from unnest(tests.sd_drivers() || array['C1', 'ADM']) x;

-- cars: (car, owner, type, class, tier, approved)
insert into public.vehicles (id, driver_id, type, class, capacity_tier, model, plate,
                             verification_status, is_verified, is_active)
select tests.sd('v' || d), tests.sd(d), t, c, tier, 'Test model', 'SD-' || d,
       case when ok then 'approved' else 'pending' end, ok, true
  from (values
    ('E_LOC', 'minivan', 'economy',  'minivan_3_5', true),
    ('E_FAR', 'minivan', 'economy',  'minivan_3_5', true),
    ('C_LOC', 'minivan', 'comfort',  'minivan_3_5', true),
    ('C_FAR', 'minivan', 'comfort',  'minivan_3_5', true),
    ('V_LOC', 'minivan', 'vip',      'minivan_3_5', true),
    ('B_LOC', 'minivan', 'business', 'minivan_3_5', true),
    ('E_BIG', 'minivan', 'economy',  'minivan_6_8', true),
    ('W_ALL', 'minivan', 'comfort',  'minivan_6_8', true),
    ('E_NOL', 'minivan', 'economy',  'minivan_3_5', true),
    ('E_NUL', 'minivan', 'economy',  'minivan_3_5', true),
    ('E_RU',  'minivan', 'economy',  'minivan_3_5', true),
    ('E_DEC', 'minivan', 'economy',  'minivan_3_5', true),
    ('C_DEC', 'minivan', 'comfort',  'minivan_3_5', true),
    ('E_BSY', 'minivan', 'economy',  'minivan_3_5', true),
    ('C_BSY', 'minivan', 'comfort',  'minivan_3_5', true),
    ('E_UNA', 'minivan', 'economy',  'minivan_3_5', true),
    ('E_BLK', 'minivan', 'economy',  'minivan_3_5', true),
    ('E_OFF', 'minivan', 'economy',  'minivan_3_5', true),
    ('E_CUA', 'minivan', 'economy',  'minivan_3_5', false),
    ('HIRED', 'minivan', 'economy',  'minivan_3_5', true),
    ('HOST',  'minivan', 'economy',  'minivan_3_5', true),
    ('G_ECO', 'minivan', 'economy',  'minivan_3_5', true),
    ('S_ECO', 'sedan',   'economy',  null,          true),
    ('MB10',  'microbus', 'economy', 'microbus_10', true),
    ('MB13',  'microbus', 'economy', 'microbus_13', true),
    ('MB16',  'microbus', 'economy', 'microbus_16', true),
    ('MB18',  'microbus', 'economy', 'microbus_18', true)
  ) as x(d, t, c, tier, ok);
-- vehicles_activate_on_approval switches approved cars on; E_OFF's is off
update public.vehicles set is_active = false where id = tests.sd('vE_OFF');

insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
values (tests.sd('HOST'), tests.sd('SUB'), tests.sd('vHOST'), 'accepted');

-- bookings -------------------------------------------------------------------
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, requested_capacity_tier, required_languages,
                             requested_driver_category, passengers, voucher_code)
select tests.sd(b), tests.sd('C1'), case when d is null then null else tests.sd(d) end, 'transfer', 'pending',
       coalesce(dd, tests.sd_start()), 'Tbilisi airport', coalesce(dest, 'Tbilisi hotel'), 150,
       t, c, tier, langs, cat, pax, 'SD-' || b
  from (values
    ('ECO',     null,    'minivan',  'economy', 'minivan_3_5', array['en'], null,    5,  null, null),
    ('ECO_ANY', null,    'minivan',  'economy', null,          null,        null,    4,  null, null),
    ('ECO68',   null,    'minivan',  'economy', 'minivan_6_8', null,        null,    4,  null, null),
    ('COMF',    null,    'minivan',  'comfort', null,          null,        null,    4,  null, null),
    ('VIP',     null,    'minivan',  'vip',     null,          null,        null,    4,  null, null),
    ('MB13',    null,    'microbus', 'economy', 'microbus_13', null,        null,    12, null, null),
    ('MB13X',   null,    'microbus', 'economy', 'microbus_13', null,        null,    17, null, null),
    ('GUIDE',   null,    'minivan',  'economy', 'minivan_3_5', array['en'], 'guide', 4,  null, null),
    ('OFFER',   'E_LOC', 'minivan',  'economy', 'minivan_3_5', null,        null,    4,  null, null),
    ('FMT',     null,    'sedan',    'economy', null,          null,        null,    2,  '2026-11-06T06:00:00.000Z', 'Kazbegi'),
    ('APP',     null,    'minivan',  'economy', 'minivan_3_5', array['en'], null,    5,  null, null)
  ) as x(b, d, t, c, tier, langs, cat, pax, dd, dest);

-- E_DEC and C_DEC decline ECO while it is open
select tests.act_as(tests.sd('E_DEC'));
select public.reject_pending_booking_as_driver(tests.sd('ECO'));
select tests.act_as(tests.sd('C_DEC'));
select public.reject_pending_booking_as_driver(tests.sd('ECO'));
select tests.act_as_owner();

-- E_BSY and C_BSY closed their calendars around the trips' time
insert into public.driver_schedules (driver_id, start_time, end_time, source)
select tests.sd(x), now() + interval '47 hours', now() + interval '49 hours', 'manual'
  from unnest(array['E_BSY', 'C_BSY']) x;

-- nothing recorded so far counts
delete from public.notifications;
delete from net.http_calls;

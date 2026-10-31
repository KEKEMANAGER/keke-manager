-- P0-4 (part A) · Push notifications are sent by the server, to recipients
-- the server picks, with text the server writes.
--
-- Before (production, and after P0-1..P0-3):
--   * Every push token sat in profiles.push_token, and every signed-in
--     account — any driver or company, approved or not — could read all of
--     them ("Profiles are viewable by everyone" + a column grant). Expo's push
--     API takes any token without a key, so anyone could send any text, under
--     the KEKE Manager name, to any user's phone.
--   * The app itself worked that way: each phone read the other side's token
--     and called Expo directly (new booking to drivers, accepted, cancelled,
--     odometer, voucher, replacement, booking updated, chat, fleet invite /
--     assignment / completion, job-board profile view).
--   * enqueue_booking_push() queued any text to any tokens the caller passed,
--     for the booking's company or its driver, and flush_push_outbox() sent it.
--   * The server's new-booking dispatch reached blocked drivers, drivers KEKE
--     has not approved and drivers who had declined the job, and two
--     dispatches of one booking that met could tell a driver twice.
--
-- After this part (safe with the app versions installed today):
--   * public.push_tokens: one token per user, readable by no client. It is
--     kept in step with profiles.push_token / users.push_token, which every
--     app version writes when it registers or signs out.
--   * "Who may hear about a booking" is one server function,
--     booking_dispatch_candidates(): a matching approved car, free at that
--     time, the category and languages asked for — and now only drivers who
--     may take jobs (P0-3), never one who declined the job (P0-1).
--   * The server sends every event the app used to send itself:
--     dispatch_new_booking() (the app still orders the waves — top-rated and
--     nearby drivers first — the server drops anyone not allowed and writes
--     the text), notify_booking_event(), notify_chat_message(),
--     notify_fleet_invite(), notify_profile_viewed(), send_test_push(). Each
--     checks who is calling and what state the booking is in, takes the
--     recipients from the booking itself, and tells each person once.
--   * enqueue_booking_push() (installed apps' second wave) no longer sends
--     what it is given: the tokens only say which drivers the app chose; of
--     those, the ones the server would pick get the server's own text, once.
--   * flush_push_outbox() sends only those rows, re-checked at send time.
--   * One dispatch of a booking at a time, so nobody is told twice.
--   * Left for part B (supabase/staged/), once the app update is out: making
--     profiles.push_token unreadable, and routing installed apps' in-app
--     notifications through the same server events.
--
-- Needs P0-1 and P0-3 part A applied first (checked below). Copies existing
-- tokens into push_tokens and turns second-wave rows already waiting in
-- push_outbox into rows for the drivers they were for; changes no other rows.
-- Undo: supabase/rollback/20261101090000_push_tokens_server_delivery_undo.sql
-- Tests: supabase/tests/run_p0_4_tests.sh (see supabase/tests/README.md)

-- 0. Preflight: stop if what this migration builds on is missing, or if a
--    definition it replaces or relies on is not the one it was written
--    against (fingerprints of the body with CRs removed).
do $$
declare
  expected constant jsonb := jsonb_build_object(
    'enqueue_booking_push(uuid,text[],text,text,jsonb,integer)', '12ad894da5ffe1c4adc89af1453a447f',
    'fetch_user_push_token(uuid)',                               'efad70f259e41014b1b707bc5b9e0837',
    'dispatch_new_booking_push(uuid,integer)',                   '9c0b9d4d4460b9dfd3ef2f5828f9c1a0',
    'flush_push_outbox(integer)',                                '1c375658064ad1dcc374fbb72531f94a',
    'booking_notify(uuid,text,text,text,jsonb)',                 '6bfc41655ab690cd4a61c6a547559ec1',
    'send_expo_push(text,text,text,jsonb)',                      'bbfb308ab95a208ed0a6c29a3f2f4b5d');
  k text;
  got text;
begin
  if to_regclass('public.booking_driver_declines') is null then
    raise exception 'P0-4 stopped: apply P0-1 (20261031120000_driver_decline_per_driver) first';
  end if;
  if to_regprocedure('public.driver_can_take_jobs(uuid)') is null then
    raise exception 'P0-4 stopped: apply P0-3 part A (20261031180000_driver_eligibility) first';
  end if;
  for k in select jsonb_object_keys(expected) loop
    select md5(replace(p.prosrc, E'\r', '')) into got
      from pg_proc p
     where p.oid = to_regprocedure('public.' || k);
    if got is distinct from expected ->> k then
      raise exception 'P0-4 stopped: public.% is not the version this migration was written against (found %, expected %)',
        k, got, expected ->> k;
    end if;
  end loop;
end
$$;

-- 1. A token store no client can read -----------------------------------------

create table if not exists public.push_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.push_tokens is
  'P0-4: the Expo push token of each user''s phone. Only the server reads it (service_role and SECURITY DEFINER functions); no client role has any right on it.';

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;
grant all on public.push_tokens to service_role;

-- What send_expo_push accepts.
create or replace function public.is_expo_push_token(p_token text)
returns boolean
language sql
immutable
as $$
  select coalesce(btrim(p_token), '') ~ '^(ExponentPushToken|ExpoPushToken)'
     and length(btrim(p_token)) <= 255;
$$;

-- Today's tokens move in (profiles first, as fetch_user_push_token preferred).
insert into public.push_tokens (user_id, token, updated_at)
select p.id, btrim(p.push_token), now()
  from public.profiles p
 where public.is_expo_push_token(p.push_token)
   and exists (select 1 from auth.users au where au.id = p.id)
on conflict (user_id) do update set token = excluded.token, updated_at = excluded.updated_at;

insert into public.push_tokens (user_id, token, updated_at)
select u.id, btrim(u.push_token), now()
  from public.users u
 where public.is_expo_push_token(u.push_token)
   and exists (select 1 from auth.users au where au.id = u.id)
on conflict (user_id) do nothing;

-- Every app version registers the same way: it writes its token to
-- profiles.push_token (and clears it on sign-out). This keeps push_tokens in
-- step (the trigger fires only when push_token is among the columns written).
-- users.push_token is mirrored only when it carries a token: the app sets it
-- to null right after saving the profile's, and that must not wipe it.
create or replace function public.push_tokens_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_expo_push_token(new.push_token) then
    insert into public.push_tokens (user_id, token, updated_at)
    values (new.id, btrim(new.push_token), now())
    on conflict (user_id) do update
      set token = excluded.token, updated_at = excluded.updated_at
      where push_tokens.token is distinct from excluded.token;
  elsif tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    -- sign-out (null), or something that is not a token: no phone to reach
    delete from public.push_tokens where user_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.is_expo_push_token(text) from public, anon, authenticated;
grant execute on function public.is_expo_push_token(text) to service_role;
revoke all on function public.push_tokens_mirror() from public, anon, authenticated;
grant execute on function public.push_tokens_mirror() to service_role;

drop trigger if exists push_tokens_mirror on public.profiles;
create trigger push_tokens_mirror
  after insert or update of push_token on public.profiles
  for each row execute function public.push_tokens_mirror();
drop trigger if exists push_tokens_mirror on public.users;
create trigger push_tokens_mirror
  after insert or update of push_token on public.users
  for each row execute function public.push_tokens_mirror();

-- The server's own lookup: push_tokens first (profiles / users while part B
-- is not applied). Still not callable by any client.
create or replace function public.fetch_user_push_token(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(btrim(t.token), '') from public.push_tokens t where t.user_id = p_user_id),
    (select nullif(btrim(p.push_token), '') from public.profiles p where p.id = p_user_id),
    (select nullif(btrim(u.push_token), '') from public.users u where u.id = p_user_id)
  );
$$;

revoke all on function public.fetch_user_push_token(uuid) from public, anon, authenticated;
grant execute on function public.fetch_user_push_token(uuid) to service_role;

-- 2. One delivery per person per event ----------------------------------------

create index if not exists notifications_dedupe_idx
  on public.notifications (user_id, type, (data ->> 'dedupe'))
  where data ? 'dedupe';

-- In-app notice + push (Expo and web) to one user, through booking_notify.
-- With a dedupe key the same event reaches the same person once, even when
-- two calls meet (the advisory lock makes the second wait and then see it).
-- The key counts per booking: the same kind of event on another booking is
-- another notice.
create or replace function public.deliver_notification(
  p_user uuid, p_title text, p_body text, p_type text, p_data jsonb, p_dedupe text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  k  text := coalesce(p_dedupe, '');
  bk text := coalesce(p_data ->> 'booking_id', '');
begin
  if p_user is null then
    return false;
  end if;
  if k <> '' then
    perform pg_advisory_xact_lock(
      hashtextextended('deliver_notification:' || p_user::text || ':' || coalesce(p_type, '') || ':' || bk || ':' || k, 0));
    if exists (select 1 from public.notifications n
                where n.user_id = p_user
                  and n.type = p_type
                  and n.data ? 'dedupe'
                  and n.data ->> 'dedupe' = k
                  and coalesce(n.data ->> 'booking_id', '') = bk) then
      return false;
    end if;
  end if;
  perform public.booking_notify(
    p_user,
    left(coalesce(nullif(btrim(p_title), ''), 'KEKE Manager'), 120),
    left(coalesce(p_body, ''), 900),
    p_type,
    coalesce(p_data, '{}'::jsonb)
      || jsonb_build_object('type', p_type)
      || case when k <> '' then jsonb_build_object('dedupe', k) else '{}'::jsonb end);
  return true;
end;
$$;

revoke all on function public.deliver_notification(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.deliver_notification(uuid, text, text, text, jsonb, text) to service_role;

create or replace function public.is_fleet_host_of(p_host uuid, p_driver uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_host is not null and p_driver is not null and exists (
    select 1 from public.driver_fleet f
     where f.host_driver_id = p_host
       and f.sub_driver_id = p_driver
       and f.status = 'accepted');
$$;

revoke all on function public.is_fleet_host_of(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_fleet_host_of(uuid, uuid) to service_role;

-- 3. New bookings: who may hear about one, and how they hear ---------------

-- The drivers the server's dispatch has always picked — a matching approved
-- car (his own or his fleet owner's), free at that time, the category and the
-- languages asked for — with the P0-4 lines: only drivers who may take jobs
-- (approved, not blocked, an approved car switched on: P0-3) and never one who
-- declined this job (P0-1). is_local: works where the job starts, or finishes
-- a job there shortly before (the server's first wave).
create or replace function public.booking_dispatch_candidates(p_booking_id uuid)
returns table (candidate_id uuid, is_local boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b       public.bookings;
  w_start timestamptz;
  w_end   timestamptz;
  v_class text;
  v_rank  int;
  v_city  text;
begin
  select * into b from public.bookings x where x.id = p_booking_id;
  if not found or b.status is distinct from 'pending' then
    return;
  end if;

  begin
    select bw.win_start, bw.win_end
      into w_start, w_end
      from public.booking_busy_window(p_booking_id) bw;
  exception when others then
    w_start := null;
    w_end   := null;
  end;

  v_class := nullif(trim(coalesce(b.vehicle_class, '')), '');
  v_rank  := public.vehicle_class_rank(v_class);
  v_city  := public.booking_start_city(p_booking_id);

  return query
    with matching_vehicles as (
      select v.id, v.driver_id
        from public.vehicles v
       where v.is_active = true
         and v.is_verified = true
         and v.verification_status = 'approved'
         and v.type = b.vehicle_type
         and (
           v_class is null
           or v.class = v_class
           or (
             v_rank is not null
             and public.vehicle_class_rank(v.class) is not null
             and public.vehicle_class_rank(v.class) >= v_rank
           )
         )
         and (nullif(trim(coalesce(b.requested_capacity_tier, '')), '') is null
              or v.capacity_tier = b.requested_capacity_tier)
    ),
    candidate_ids as (
      select mv.driver_id as id from matching_vehicles mv where mv.driver_id is not null
      union
      select f.sub_driver_id
        from public.driver_fleet f
        join matching_vehicles mv on mv.id = f.vehicle_id
       where f.status = 'accepted' and f.sub_driver_id is not null
    )
    select c.id,
           (
             v_city is null
             or public.driver_city_key(c.id) = v_city
             or exists (
               select 1
                 from public.driver_schedules s
                 join public.bookings pb on pb.id = s.booking_id
                where s.driver_id = c.id
                  and w_start is not null
                  and s.end_time <= w_start
                  and s.end_time >= w_start - interval '3 hours'
                  and pb.status in ('accepted', 'in_progress', 'completed')
                  and public.city_key(pb.to_location) = v_city
             )
           )
      from candidate_ids c
      left join public.users u    on u.id = c.id
      left join public.profiles p on p.id = c.id
     where (b.driver_id is null or c.id = b.driver_id)
       and c.id is distinct from b.company_id
       -- P0-4: only drivers who may take jobs (P0-3) ...
       and public.driver_can_take_jobs(c.id)
       -- ... and never one who declined this job (P0-1)
       and not exists (
         select 1 from public.booking_driver_declines dd
          where dd.booking_id = b.id
            and dd.driver_id = c.id
       )
       and (b.driver_id is not null or coalesce(u.is_hired_driver, false) = false)
       and (
         coalesce(nullif(trim(b.requested_driver_category), ''), 'all') = 'all'
         or (
           coalesce(u.is_hired_driver, false) = false
           and (
             (b.requested_driver_category = 'guide'
                and coalesce(u.is_guide_driver, false) = true)
             or (b.requested_driver_category = 'own_vehicle'
                and coalesce(u.is_guide_driver, false) = false)
           )
         )
       )
       and (
         b.required_languages is null
         or array_length(b.required_languages, 1) is null
         or coalesce(u.languages, p.languages, array[]::text[]) && b.required_languages
       )
       and (
         w_start is null
         or w_end is null
         or not exists (
           select 1
             from public.driver_schedules ds
            where ds.driver_id = c.id
              and ds.booking_id is distinct from b.id
              and ds.start_time < w_end
              and ds.end_time   > w_start
         )
       );
end;
$$;

-- The new-booking text: the server's own, as dispatch has always sent it.
create or replace function public.booking_dispatch_message(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b      public.bookings;
  v_kind text;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return null;
  end if;
  v_kind := lower(coalesce(nullif(trim(b.kind), ''), nullif(trim(b.booking_type), ''), 'transfer'));
  return jsonb_build_object(
    'title', case
               when v_kind in ('day_tour', 'daytour') then 'KEKE · ახალი დღის ტური!'
               when v_kind = 'tour' then 'KEKE · ახალი ტური!'
               else 'KEKE · ახალი ტრანსფერი!'
             end,
    'body', public.booking_route_summary(b.from_location, b.to_location, b.route::text)
            || coalesce(' · ' || nullif(trim(b.date_display), ''), ''),
    'data', jsonb_build_object(
              'type', 'new_booking',
              'booking_id', b.id::text,
              'booking_kind', case when v_kind in ('tour', 'day_tour') then v_kind else 'transfer' end,
              'vehicle_type', coalesce(b.vehicle_type, ''),
              'vehicle_class', coalesce(b.vehicle_class, '')));
end;
$$;

-- Told already (an in-app notice exists) or about to be (a second-wave row
-- is waiting): either way, not again.
create or replace function public.booking_driver_told(p_booking_id uuid, p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.notifications n
            where n.user_id = p_driver_id
              and n.type = 'new_booking'
              and (n.data ->> 'booking_id') = p_booking_id::text)
      or exists (
           select 1 from public.push_outbox o
            where o.booking_id = p_booking_id
              and o.user_id = p_driver_id
              and o.sent_at is null);
$$;

revoke all on function public.booking_dispatch_candidates(uuid) from public, anon, authenticated;
revoke all on function public.booking_dispatch_message(uuid) from public, anon, authenticated;
revoke all on function public.booking_driver_told(uuid, uuid) from public, anon, authenticated;
grant execute on function public.booking_dispatch_candidates(uuid) to service_role;
grant execute on function public.booking_dispatch_message(uuid) to service_role;
grant execute on function public.booking_driver_told(uuid, uuid) to service_role;

-- push_outbox: from now on a row names the driver (user_id), not a phone.
-- Second-wave rows already waiting, queued by installed apps with a token,
-- are given to the driver that token belongs to; anything else waiting is
-- dropped (marked sent) — whoever queued it chose its text and its phone.
with legacy as (
  select o.id, t.user_id,
         row_number() over (partition by o.booking_id, t.user_id order by o.send_after, o.id) as rn
    from public.push_outbox o
    join lateral (
      select pt.user_id from public.push_tokens pt
       where pt.token = btrim(o.token)
       order by pt.updated_at desc
       limit 1
    ) t on true
   where o.sent_at is null
     and o.user_id is null
     and o.booking_id is not null
     and (o.data ->> 'type') = 'new_booking'
)
update public.push_outbox o
   set user_id = l.user_id, token = ''
  from legacy l
 where l.id = o.id
   and l.rn = 1
   and not exists (select 1 from public.push_outbox x
                    where x.booking_id = o.booking_id and x.user_id = l.user_id);

update public.push_outbox set sent_at = now() where sent_at is null and user_id is null;

create unique index if not exists push_outbox_booking_user_key
  on public.push_outbox (booking_id, user_id)
  where user_id is not null;

-- The server's dispatch (the one-minute fallback, the second wave, and
-- dispatch_new_booking without an order from the app): production function,
-- with the recipients from booking_dispatch_candidates() and one dispatch of
-- a booking at a time.
CREATE OR REPLACE FUNCTION public.dispatch_new_booking_push(p_booking_id uuid, p_wave integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b          record;
  d          record;
  msg        jsonb;
  n          int := 0;
  deferred   int := 0;
  pushed     int := 0;
  v_city     text;
  v_wave     int := case when p_wave = 2 then 2 else 1 end;
  v_told     uuid[] := '{}';
begin
  -- P0-4: one dispatch of a booking at a time (the app, the one-minute
  -- fallback and the second wave can meet), so the "already told" check
  -- below always sees the other run's notifications and nobody is told twice.
  select * into b from public.bookings where id = p_booking_id for update;
  if not found or b.status <> 'pending' then
    return 0;
  end if;

  v_city := public.booking_start_city(p_booking_id);
  msg    := public.booking_dispatch_message(p_booking_id);

  for d in
    select c.candidate_id as id,
           c.is_local,
           public.fetch_user_push_token(c.candidate_id) is not null as has_push
      from public.booking_dispatch_candidates(p_booking_id) c
     where not public.booking_driver_told(p_booking_id, c.candidate_id)
  loop
    if v_wave = 1 and not d.is_local then
      deferred := deferred + 1;
      continue;
    end if;
    perform public.booking_notify(d.id, msg ->> 'title', msg ->> 'body', 'new_booking', msg -> 'data');
    v_told := v_told || d.id;
    n := n + 1;
    if d.has_push then pushed := pushed + 1; end if;
  end loop;

  -- The admin panel reads this table. Without a row here a dispatch leaves no
  -- trace at all, which is how two bookings reached nobody unnoticed.
  if v_wave = 1 then
    -- P0-4: a repeat that found everyone told already adds no "reached
    -- nobody" row over the real one
    if n > 0 or deferred > 0
       or not exists (select 1 from public.dispatch_log x where x.booking_id = b.id) then
      insert into public.dispatch_log (
        booking_id, company_id, regions, from_location, to_location,
        wave1_driver_ids, wave1_token_count, wave1_sent
      ) values (
        b.id, b.company_id, case when v_city is null then '{}'::text[] else array[v_city] end,
        b.from_location, b.to_location, v_told, pushed, n
      );
    end if;
    update public.bookings
       set dispatch_wave2_due_at = case when deferred > 0 then now() + interval '3 minutes' end
     where id = p_booking_id;
  else
    update public.dispatch_log
       set wave2_driver_ids = v_told, wave2_token_count = pushed
     where booking_id = b.id
       and id = (select id from public.dispatch_log where booking_id = b.id
                 order by created_at desc limit 1);
    update public.bookings set dispatch_wave2_due_at = null where id = p_booking_id;
  end if;

  return n;
end;
$function$;

revoke all on function public.dispatch_new_booking_push(uuid, integer) from public, anon, authenticated;
grant execute on function public.dispatch_new_booking_push(uuid, integer) to service_role;

-- The company has created a booking: tell the drivers. The app sends the
-- order it worked out (p_first now — top-rated, nearby, finishing next door —
-- and p_later three minutes on); the server keeps only the drivers it would
-- pick itself and writes the text. Without an order (both null), or when none
-- of the drivers the app put forward may be told, the server's own waves run,
-- once. Either way the one-minute fallback then stays away.
create or replace function public.dispatch_new_booking(
  p_booking_id uuid, p_first uuid[] default null, p_later uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  b         public.bookings;
  msg       jsonb;
  c         record;
  now_ids   uuid[] := '{}';
  later_ids uuid[] := '{}';
  pushed    int := 0;
  first_run boolean;
  n         int;
  v_city    text;
begin
  if uid is null then
    raise exception 'dispatch_new_booking: sign in first' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('notified', 0, 'queued', 0);
  end if;
  if uid is distinct from b.company_id and not public.is_admin_user() then
    raise exception 'dispatch_new_booking: not your booking' using errcode = '42501';
  end if;
  if b.status is distinct from 'pending' or coalesce(b.is_group_master, false) then
    return jsonb_build_object('notified', 0, 'queued', 0, 'open', false);
  end if;
  first_run := b.dispatch_fallback_sent_at is null;

  if p_first is null and p_later is null then
    if not first_run
       or exists (select 1 from public.notifications x
                   where x.type = 'new_booking' and x.data ->> 'booking_id' = b.id::text) then
      return jsonb_build_object('notified', 0, 'queued', 0, 'already', true);
    end if;
    update public.bookings set dispatch_fallback_sent_at = now() where id = b.id;
    n := public.dispatch_new_booking_push(b.id, 1);
    return jsonb_build_object(
      'notified', n,
      'queued', 0,
      'waiting', (select x.dispatch_wave2_due_at is not null from public.bookings x where x.id = b.id));
  end if;

  msg := public.booking_dispatch_message(b.id);
  for c in
    select x.candidate_id as id,
           public.fetch_user_push_token(x.candidate_id) is not null as has_push
      from public.booking_dispatch_candidates(b.id) x
     where not public.booking_driver_told(b.id, x.candidate_id)
  loop
    if c.id = any (coalesce(p_first, '{}'::uuid[])) then
      perform public.booking_notify(c.id, msg ->> 'title', msg ->> 'body', 'new_booking', msg -> 'data');
      now_ids := now_ids || c.id;
      if c.has_push then pushed := pushed + 1; end if;
    elsif c.id = any (coalesce(p_later, '{}'::uuid[])) then
      insert into public.push_outbox (booking_id, user_id, token, title, body, data, send_after)
      values (b.id, c.id, '', msg ->> 'title', msg ->> 'body', msg -> 'data', now() + interval '3 minutes')
      on conflict (booking_id, user_id) where user_id is not null do nothing;
      if found then
        later_ids := later_ids || c.id;
      end if;
    end if;
  end loop;

  if first_run
     and cardinality(now_ids) + cardinality(later_ids) = 0
     and not exists (select 1 from public.notifications x
                      where x.type = 'new_booking' and x.data ->> 'booking_id' = b.id::text) then
    -- none of the drivers the app put forward may be told: the server's own
    -- waves, as the one-minute fallback would have run them
    update public.bookings set dispatch_fallback_sent_at = now() where id = b.id;
    n := public.dispatch_new_booking_push(b.id, 1);
    return jsonb_build_object('notified', n, 'queued', 0, 'server_waves', true);
  end if;

  update public.bookings
     set dispatch_fallback_sent_at = coalesce(dispatch_fallback_sent_at, now())
   where id = b.id;

  if first_run or cardinality(now_ids) + cardinality(later_ids) > 0 then
    v_city := public.booking_start_city(b.id);
    insert into public.dispatch_log (
      booking_id, company_id, regions, from_location, to_location,
      wave1_driver_ids, wave2_driver_ids, wave1_token_count, wave2_token_count, wave1_sent
    ) values (
      b.id, b.company_id, case when v_city is null then '{}'::text[] else array[v_city] end,
      b.from_location, b.to_location, now_ids, later_ids, pushed, cardinality(later_ids), cardinality(now_ids)
    );
  end if;

  return jsonb_build_object('notified', cardinality(now_ids), 'queued', cardinality(later_ids));
end;
$$;

revoke all on function public.dispatch_new_booking(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.dispatch_new_booking(uuid, uuid[], uuid[]) to authenticated, service_role;

-- Installed apps send their second wave as a list of phones (tokens), a
-- title and a text. The text and title are ignored, and a phone counts only
-- as "this driver": the drivers among them the server would pick get the
-- server's own text when the delay is up (flush_push_outbox), once each.
-- Only the booking's company (or an admin), only while the job is open.
create or replace function public.enqueue_booking_push(p_booking_id uuid, p_tokens text[], p_title text, p_body text, p_data jsonb default '{}'::jsonb, p_delay_seconds integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  b       public.bookings;
  msg     jsonb;
  r       record;
  n       int  := 0;
  v_delay int  := least(greatest(coalesce(p_delay_seconds, 180), 0), 3600);
begin
  if caller is null or p_booking_id is null then
    return 0;
  end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return 0;
  end if;
  if caller is distinct from b.company_id and not public.is_admin_user() then
    return 0;
  end if;
  if b.status is distinct from 'pending' or b.driver_id is not null then
    return 0;
  end if;

  msg := public.booking_dispatch_message(b.id);
  for r in
    select distinct on (t.token) t.user_id
      from unnest(coalesce(p_tokens, '{}'::text[])) x(tok)
      join public.push_tokens t on t.token = btrim(x.tok)
      join public.booking_dispatch_candidates(b.id) c on c.candidate_id = t.user_id
     order by t.token, t.updated_at desc
  loop
    insert into public.push_outbox (booking_id, user_id, token, title, body, data, send_after)
    values (b.id, r.user_id, '', msg ->> 'title', msg ->> 'body', msg -> 'data',
            now() + make_interval(secs => v_delay))
    on conflict (booking_id, user_id) where user_id is not null do nothing;
    if found then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, integer) from public, anon;
grant execute on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, integer) to authenticated, service_role;

-- Every minute (cron "push-outbox-flush"). Sends second-wave rows that are
-- due, each to the driver it names, with the server's text, and only if he
-- may still hear about the job then (still open, still allowed, not declined,
-- still free). A driver the installed app already gave the in-app notice gets
-- the phone notification only.
create or replace function public.flush_push_outbox(p_limit integer default 300)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r         record;
  sent      int := 0;
  cur       uuid;
  started   boolean := false;
  cand      uuid[] := '{}';
  msg       jsonb;
  tok       text;
begin
  update public.push_outbox set sent_at = now() where sent_at is null and user_id is null;

  for r in
    select o.id, o.booking_id, o.user_id
      from public.push_outbox o
     where o.sent_at is null
       and o.user_id is not null
       and o.send_after <= now()
     order by o.booking_id, o.send_after
     limit greatest(coalesce(p_limit, 300), 1)
     for update skip locked
  loop
    if not started or r.booking_id is distinct from cur then
      started := true;
      cur := r.booking_id;
      select coalesce(array_agg(c.candidate_id), '{}'::uuid[]) into cand
        from public.booking_dispatch_candidates(r.booking_id) c;
      msg := public.booking_dispatch_message(r.booking_id);
    end if;

    if msg is not null and r.user_id = any (cand) then
      if exists (select 1 from public.notifications n
                  where n.user_id = r.user_id
                    and n.type = 'new_booking'
                    and (n.data ->> 'booking_id') = r.booking_id::text) then
        tok := public.fetch_user_push_token(r.user_id);
        if tok is not null then
          perform public.send_expo_push(tok, msg ->> 'title', msg ->> 'body', msg -> 'data');
        end if;
        perform public.send_web_push(r.user_id, msg ->> 'title', msg ->> 'body', msg -> 'data');
      else
        perform public.booking_notify(r.user_id, msg ->> 'title', msg ->> 'body', 'new_booking', msg -> 'data');
      end if;
      sent := sent + 1;
    end if;

    update public.push_outbox set sent_at = now() where id = r.id;
  end loop;

  delete from public.push_outbox
   where sent_at is not null and sent_at < now() - interval '3 days';

  return sent;
end;
$$;

revoke all on function public.flush_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.flush_push_outbox(integer) to service_role;

-- 4. The other events the app used to push itself ----------------------------
--
-- The caller says which booking and what happened. The server checks that the
-- caller is the one who can make that happen and that it did happen, then
-- takes the recipients from the booking and writes the text (Georgian, the
-- app's own Georgian strings; the type and booking_id the app's notification
-- tap already understands).
create or replace function public.notify_booking_event(p_booking_id uuid, p_event text, p_phase text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  b      public.bookings;
  admin  boolean;
  route  text;
  who    text;
  code   text;
  host   uuid;
  phase  text;
  url    text;
  key    text;
  detail text;
  h_id   uuid;
  h_chg  jsonb;
  d      jsonb;
  n      int := 0;
  r      uuid;
begin
  if uid is null then
    raise exception 'notify_booking_event: sign in first' using errcode = '42501';
  end if;
  if p_event is null or p_event not in ('accepted', 'driver_cancelled', 'odometer', 'voucher', 'emergency',
                                        'updated', 'host_assigned', 'host_completed') then
    raise exception 'notify_booking_event: unknown event %', p_event using errcode = '22023';
  end if;
  if p_booking_id is null then
    return 0;
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return 0;
  end if;
  admin := public.is_admin_user();
  route := public.booking_route_summary(b.from_location, b.to_location, b.route::text);
  code  := nullif(btrim(coalesce(b.voucher_code, '')), '');
  who   := coalesce(nullif(btrim(b.driver_display_name), ''),
                    (select nullif(btrim(u.full_name), '') from public.users u where u.id = b.driver_id),
                    'მძღოლი');
  d := jsonb_build_object('booking_id', b.id::text);

  -- Every rights check below is wrapped in coalesce(..., false): a booking
  -- without a fleet owner has host_driver_id null, and "uid = null" is null,
  -- which an IF would otherwise treat as "not refused".
  if p_event = 'accepted' then
    -- the driver, or the fleet owner who gave the job to his driver
    if not coalesce(admin or uid = b.driver_id or uid = b.host_driver_id or public.is_fleet_host_of(uid, b.driver_id), false) then
      raise exception 'notify_booking_event: not your booking' using errcode = '42501';
    end if;
    if b.driver_id is null or b.status not in ('accepted', 'confirmed', 'in_progress') then
      return 0;
    end if;
    -- one notice per acceptance (a new acceptance has a new calendar block)
    key := 'accepted:' || coalesce(
             (select s.id::text from public.driver_schedules s
               where s.booking_id = b.id and s.driver_id = b.driver_id
               order by s.id limit 1),
             b.driver_id::text);
    n := public.deliver_notification(b.company_id, 'KEKE',
           concat_ws(E'\n', 'ჯავშანი დადასტურდა ✅',
                     '👤 ' || nullif(btrim(b.driver_display_name), ''),
                     '📞 ' || nullif(btrim(b.driver_phone), ''),
                     '🚗 ' || nullif(btrim(b.driver_plate), '')),
           'booking_accepted', d, key)::int;

  elsif p_event = 'driver_cancelled' then
    if not coalesce(admin or uid = b.driver_id or uid = b.host_driver_id, false) then
      raise exception 'notify_booking_event: not your booking' using errcode = '42501';
    end if;
    if b.status is distinct from 'cancelled' then
      return 0;
    end if;
    n := public.deliver_notification(b.company_id, 'KEKE · ჯავშანი გაუქმდა',
           concat_ws(E'\n',
             case when nullif(btrim(b.driver_display_name), '') is not null
                  then 'მძღოლი ' || btrim(b.driver_display_name) || ' გააუქმა ჯავშანი'
                  else 'მძღოლმა გააუქმა ჯავშანი' end,
             route),
           'booking_driver_cancelled', d, 'driver_cancelled:' || coalesce(b.driver_id::text, ''))::int;

  elsif p_event = 'odometer' then
    if not coalesce(admin or uid = b.driver_id or uid = b.host_driver_id, false) then
      raise exception 'notify_booking_event: not your booking' using errcode = '42501';
    end if;
    phase := lower(btrim(coalesce(p_phase, '')));
    if phase not in ('start', 'end') then
      raise exception 'notify_booking_event: odometer phase is start or end' using errcode = '22023';
    end if;
    url := case phase when 'start' then b.odometer_start_photo_url else b.odometer_end_photo_url end;
    if nullif(btrim(coalesce(url, '')), '') is null then
      return 0;
    end if;
    -- once per photo: a retaken photo is a new notice
    n := public.deliver_notification(b.company_id,
           case phase when 'start' then 'KEKE · ოდომეტრი (დაწყება)' else 'KEKE · ოდომეტრი (დასრულება)' end,
           concat_ws(E'\n',
             case phase when 'start' then 'მძღოლი ატვირთა დაწყების ოდომეტრის ფოტო.'
                        else 'მძღოლი ატვირთა დასრულების ოდომეტრის ფოტო.' end,
             route),
           'booking_odometer', d || jsonb_build_object('odometer_phase', phase),
           'odometer:' || phase || ':' || md5(url))::int;

  elsif p_event in ('voucher', 'emergency') then
    -- the company gave the job to a driver it chose
    if not coalesce(admin or uid = b.company_id, false) then
      raise exception 'notify_booking_event: not your booking' using errcode = '42501';
    end if;
    if b.driver_id is null
       or b.status in ('cancelled', 'rejected', 'completed')
       or (p_event = 'emergency' and not coalesce(b.is_emergency_replacement, false)) then
      return 0;
    end if;
    code := coalesce(code, 'KEKE-' || upper(left(b.id::text, 8)));
    d := d || jsonb_build_object('voucher_code', code);
    -- the driver hears about a job only if he may take it (P0-3)
    if public.driver_can_take_jobs(b.driver_id) then
      n := public.deliver_notification(b.driver_id,
             case p_event when 'emergency' then 'KEKE · ჩანაცვლება' else 'KEKE · ვაუჩერი' end,
             concat_ws(E'\n', 'ვაუჩერი ' || code, route),
             'booking_voucher',
             case p_event when 'emergency' then d || jsonb_build_object('is_emergency_replacement', true) else d end,
             p_event || ':' || b.driver_id::text)::int;
    end if;
    if p_event = 'voucher' then
      n := n + public.deliver_notification(b.company_id, 'KEKE · ვაუჩერი',
                 concat_ws(E'\n', 'ვაუჩერი ' || code, route),
                 'booking_voucher', d, 'voucher:' || b.driver_id::text)::int;
    end if;

  elsif p_event = 'updated' then
    if not coalesce(admin or uid = b.company_id, false) then
      raise exception 'notify_booking_event: not your booking' using errcode = '42501';
    end if;
    if b.status in ('cancelled', 'rejected', 'completed') then
      return 0;
    end if;
    -- what changed: the company's own change log for this booking (the app
    -- writes it just before), at most six lines; otherwise a plain line
    select h.id, h.changes into h_id, h_chg
      from public.booking_history h
     where h.booking_id = b.id
       and h.changed_by = b.company_id
       and h.created_at > now() - interval '10 minutes'
     order by h.created_at desc
     limit 1;
    if h_id is not null then
      if jsonb_typeof(h_chg) = 'object' then
        select string_agg(left(coalesce(e.value ->> 'label', e.key), 60) || ': '
                          || left(coalesce(e.value ->> 'old', '—'), 80) || ' → '
                          || left(coalesce(e.value ->> 'new', '—'), 80), E'\n')
          into detail
          from (select j.key, j.value from jsonb_each(h_chg) j where jsonb_typeof(j.value) = 'object' limit 6) e;
      end if;
      key := 'updated:' || h_id::text;
    else
      key := 'updated:' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI');
    end if;
    for r in select distinct x from unnest(array[b.driver_id, b.host_driver_id]) x where x is not null loop
      n := n + public.deliver_notification(r, '📝 ჯავშანი განახლდა',
                 coalesce(nullif(detail, ''), concat_ws(E'\n', 'კომპანიამ შეცვალა ჯავშნის დეტალები', route)),
                 'booking_updated', d, key)::int;
    end loop;

  elsif p_event = 'host_assigned' then
    -- a fleet owner gave a job he took to one of his drivers
    if not coalesce(admin or uid = b.host_driver_id or public.is_fleet_host_of(uid, b.driver_id), false) then
      raise exception 'notify_booking_event: not your driver' using errcode = '42501';
    end if;
    if b.driver_id is null or b.status not in ('accepted', 'confirmed', 'in_progress') then
      return 0;
    end if;
    n := public.deliver_notification(b.driver_id, 'KEKE · ახალი ჯავშანი',
           concat_ws(E'\n',
             case when code is not null then 'ვაუჩერი ' || code || ' · ' || route
                  else 'ახალი ტური: ' || route end,
             case when coalesce(b.driver_payout_gel, 0) > 0
                  then 'შენი ხელფასი: ' || trim_scale(b.driver_payout_gel)::text || ' ₾' end),
           'booking_assigned',
           d || jsonb_strip_nulls(jsonb_build_object('host_driver_id', b.host_driver_id::text)),
           'host_assigned:' || b.driver_id::text)::int;

  elsif p_event = 'host_completed' then
    if not coalesce(admin or uid = b.driver_id, false) then
      raise exception 'notify_booking_event: not your booking' using errcode = '42501';
    end if;
    if b.status is distinct from 'completed' then
      return 0;
    end if;
    host := coalesce(b.host_driver_id,
                     (select f.host_driver_id from public.driver_fleet f
                       where f.sub_driver_id = b.driver_id and f.status = 'accepted'
                       order by f.created_at desc limit 1));
    if host is null then
      return 0;
    end if;
    n := public.deliver_notification(host, 'KEKE · ტური დასრულდა',
           concat_ws(E'\n',
             case when nullif(btrim(b.driver_display_name), '') is not null
                  then btrim(b.driver_display_name) || ' დაასრულა ტური'
                  else 'თქვენს მძღოლმა ტური დაასრულა' end,
             route),
           'booking_completed_host', d, 'host_completed')::int;
  end if;
  return n;
end;
$$;

-- A chat message the caller has sent: the receiver gets it once. With the
-- message id, that message; without (a convoy sends one row per driver), the
-- newest one to that receiver not told yet. Only messages of the last ten
-- minutes, only the caller's own.
create or replace function public.notify_chat_message(p_receiver_id uuid, p_message_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m   public.messages;
  sender_name text;
begin
  if uid is null then
    raise exception 'notify_chat_message: sign in first' using errcode = '42501';
  end if;
  if p_receiver_id is null then
    return 0;
  end if;
  if p_message_id is not null then
    select * into m
      from public.messages x
     where x.id = p_message_id
       and x.sender_id = uid
       and x.receiver_id = p_receiver_id;
  else
    select * into m
      from public.messages x
     where x.sender_id = uid
       and x.receiver_id = p_receiver_id
       and x.created_at > now() - interval '10 minutes'
       and not exists (
         select 1 from public.notifications n
          where n.user_id = x.receiver_id
            and n.type = 'chat_message'
            and n.data ? 'dedupe'
            and n.data ->> 'dedupe' = 'msg:' || x.id::text)
     order by x.created_at desc
     limit 1;
  end if;
  if not found or m.created_at <= now() - interval '10 minutes' then
    return 0;
  end if;
  sender_name := coalesce(
    (select nullif(btrim(coalesce(nullif(btrim(u.company_name), ''), u.full_name)), '')
       from public.users u where u.id = uid),
    'ახალი შეტყობინება');
  return public.deliver_notification(
    m.receiver_id,
    case when m.thread_type = 'support' then 'KEKE საფორტი' else sender_name end,
    coalesce(nullif(left(btrim(m.text), 120), ''), 'ახალი შეტყობინება'),
    'chat_message',
    jsonb_strip_nulls(jsonb_build_object('sender_id', uid::text, 'booking_id', m.booking_id::text,
                                         'thread_type', m.thread_type)),
    'msg:' || m.id::text)::int;
end;
$$;

-- A fleet owner's invitation to a driver.
create or replace function public.notify_fleet_invite(p_fleet_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  f   public.driver_fleet;
  host_name text;
begin
  if uid is null then
    raise exception 'notify_fleet_invite: sign in first' using errcode = '42501';
  end if;
  select * into f from public.driver_fleet where id = p_fleet_id;
  if not found then
    return 0;
  end if;
  if uid is distinct from f.host_driver_id and not public.is_admin_user() then
    raise exception 'notify_fleet_invite: not your invitation' using errcode = '42501';
  end if;
  if f.status is distinct from 'pending' then
    return 0;
  end if;
  host_name := coalesce((select nullif(btrim(u.full_name), '') from public.users u where u.id = f.host_driver_id), 'მძღოლი');
  return public.deliver_notification(f.sub_driver_id, 'KEKE · ფლოტის მოწვევა',
           host_name || ' გიწვევს ფლოტში', 'fleet_invite',
           jsonb_build_object('fleet_id', f.id::text, 'host_driver_id', f.host_driver_id::text),
           -- a repeated invitation reuses the row: at most one notice a minute
           'fleet_invite:' || f.id::text || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI'))::int;
end;
$$;

-- "Someone looked at your profile" on the hired-driver job board, at most
-- once a day per viewer.
create or replace function public.notify_profile_viewed(p_driver_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'notify_profile_viewed: sign in first' using errcode = '42501';
  end if;
  if p_driver_id is null or p_driver_id = uid then
    return 0;
  end if;
  if not exists (select 1 from public.users me
                  where me.id = uid and me.role in ('driver', 'company')
                    and coalesce(me.is_blocked, false) = false) then
    raise exception 'notify_profile_viewed: not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users t
                  where t.id = p_driver_id and t.role = 'driver'
                    and coalesce(t.is_hired_driver, false) = true
                    and coalesce(t.available_for_hire, true) = true) then
    return 0;
  end if;
  return public.deliver_notification(p_driver_id, 'KEKE', 'ვიღაცამ თქვენი პროფილი ნახა',
           'profile_viewed', '{}'::jsonb,
           'viewed:' || uid::text || ':' || to_char(now() at time zone 'Asia/Tbilisi', 'YYYY-MM-DD'))::int;
end;
$$;

-- The dashboard's "send a test push": to the caller's own phone only.
create or replace function public.send_test_push()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null then
    raise exception 'send_test_push: sign in first' using errcode = '42501';
  end if;
  tok := public.fetch_user_push_token(uid);
  if tok is null then
    return false;
  end if;
  perform public.send_expo_push(tok, 'KEKE ტესტი', 'Push შეტყობინებები მუშაობს!', '{"type": "test"}'::jsonb);
  return true;
end;
$$;

revoke all on function public.notify_booking_event(uuid, text, text) from public, anon;
revoke all on function public.notify_chat_message(uuid, uuid) from public, anon;
revoke all on function public.notify_fleet_invite(uuid) from public, anon;
revoke all on function public.notify_profile_viewed(uuid) from public, anon;
revoke all on function public.send_test_push() from public, anon;
grant execute on function public.notify_booking_event(uuid, text, text) to authenticated, service_role;
grant execute on function public.notify_chat_message(uuid, uuid) to authenticated, service_role;
grant execute on function public.notify_fleet_invite(uuid) to authenticated, service_role;
grant execute on function public.notify_profile_viewed(uuid) to authenticated, service_role;
grant execute on function public.send_test_push() to authenticated, service_role;

comment on function public.notify_booking_event(uuid, text, text) is
  'P0-4: the server sends a booking event (accepted, driver_cancelled, odometer, voucher, emergency, updated, host_assigned, host_completed) to recipients it takes from the booking, once each.';
comment on function public.dispatch_new_booking(uuid, uuid[], uuid[]) is
  'P0-4: tells drivers about a new booking. The app may give the order (first now, later in three minutes); the server keeps only drivers booking_dispatch_candidates() allows and writes the text.';

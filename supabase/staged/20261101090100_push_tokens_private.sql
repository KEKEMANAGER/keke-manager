-- P0-4 (part B) · Nobody but the server can read a push token.
--
-- STAGED: not in supabase/migrations on purpose. Apply it after part A
-- (20261101090000_push_tokens_server_delivery) and after the app update that
-- sends notifications through the server is out (see supabase/staged/README.md).
--
-- What it does:
--   * profiles.push_token and users.push_token stop holding tokens. Every app
--     version keeps registering exactly as before — it writes its token to
--     profiles.push_token, and clears it on sign-out — but a trigger takes the
--     token into public.push_tokens and leaves the column empty. The column
--     stays (installed versions still select it), so no screen breaks: other
--     users' tokens just read as empty, and so does one's own.
--   * A phone belongs to the account signed in on it now: a token registered
--     by one account is taken away from any other account that still had it
--     (a sign-out that never reached the server), so one person's
--     notifications never land on someone else's phone.
--   * Installed app versions can no longer send pushes themselves (they find
--     no tokens). What they still do is write in-app notices through
--     create_user_notifications(); each of those now becomes the matching
--     server event (notify_booking_event and the others from part A), which
--     writes the notice and sends the push, with the server's text, to the
--     recipients the server takes from the booking. Anything else is dropped,
--     except a note of another kind to oneself, kept in-app as before. New bookings from
--     installed versions reach drivers through the server's one-minute
--     fallback (dispatch_missed_new_bookings), as the first wave would have.
--
-- Undo: supabase/rollback/20261101090100_push_tokens_private_undo.sql
-- Tests: supabase/tests/run_p0_4_tests.sh

-- 0. Preflight: part A must be in place, and the definitions this replaces
--    must be the ones it was written against.
do $$
declare
  expected constant jsonb := jsonb_build_object(
    'fetch_user_push_token(uuid)',      '1a9696a1d05d91d05150c853e474e976',
    'push_tokens_mirror()',             '210c0dcbe0bc6b0b2243950ecc4b9b18',
    'create_user_notifications(jsonb)', 'e2599fe0c6e36900c8983ae506f82e59');
  k text;
  got text;
begin
  if to_regclass('public.push_tokens') is null
     or to_regprocedure('public.notify_booking_event(uuid,text,text)') is null
     or to_regprocedure('public.dispatch_new_booking(uuid,uuid[],uuid[])') is null then
    raise exception 'P0-4 part B stopped: apply part A (20261101090000_push_tokens_server_delivery) first';
  end if;
  for k in select jsonb_object_keys(expected) loop
    select md5(replace(p.prosrc, E'\r', '')) into got
      from pg_proc p
     where p.oid = to_regprocedure('public.' || k);
    if got is distinct from expected ->> k then
      raise exception 'P0-4 part B stopped: public.% is not the version this migration was written against (found %, expected %)',
        k, got, expected ->> k;
    end if;
  end loop;
end
$$;

-- 1. Last copy from the columns, then the columns are emptied ---------------

insert into public.push_tokens (user_id, token, updated_at)
select p.id, btrim(p.push_token), now()
  from public.profiles p
 where public.is_expo_push_token(p.push_token)
   and exists (select 1 from auth.users au where au.id = p.id)
on conflict (user_id) do update set token = excluded.token, updated_at = excluded.updated_at
  where push_tokens.token is distinct from excluded.token;

insert into public.push_tokens (user_id, token, updated_at)
select u.id, btrim(u.push_token), now()
  from public.users u
 where public.is_expo_push_token(u.push_token)
   and exists (select 1 from auth.users au where au.id = u.id)
on conflict (user_id) do nothing;

drop trigger if exists push_tokens_mirror on public.profiles;
drop trigger if exists push_tokens_mirror on public.users;

update public.profiles set push_token = null where push_token is not null;
update public.users set push_token = null where push_token is not null;

-- 2. One account per phone ----------------------------------------------------

-- A phone two accounts still hold (a sign-out that never reached the server)
-- stays with the account that registered it last.
delete from public.push_tokens t
 using public.push_tokens newer
 where newer.token = t.token
   and newer.user_id <> t.user_id
   and (newer.updated_at > t.updated_at
        or (newer.updated_at = t.updated_at and newer.user_id::text > t.user_id::text));

create unique index if not exists push_tokens_token_key on public.push_tokens (token);

-- 3. Registration keeps working, the column stays empty ---------------------

create or replace function public.push_tokens_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tok text := btrim(coalesce(new.push_token, ''));
begin
  if public.is_expo_push_token(tok) then
    perform pg_advisory_xact_lock(hashtextextended('push_tokens:' || tok, 0));
    -- the phone belongs to the account signed in on it now
    delete from public.push_tokens where token = tok and user_id <> new.id;
    insert into public.push_tokens (user_id, token, updated_at)
    values (new.id, tok, now())
    on conflict (user_id) do update
      set token = excluded.token, updated_at = excluded.updated_at;
  elsif tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    -- the app's sign-out writes profiles.push_token = null (anything else
    -- that is not a token means no phone to reach either)
    delete from public.push_tokens where user_id = new.id;
  end if;
  -- users.push_token = null (the app does it right after saving the
  -- profile's) leaves the stored token alone
  new.push_token := null;
  return new;
end;
$$;

revoke all on function public.push_tokens_capture() from public, anon, authenticated;
grant execute on function public.push_tokens_capture() to service_role;

drop trigger if exists push_tokens_capture on public.profiles;
create trigger push_tokens_capture
  before insert or update of push_token on public.profiles
  for each row execute function public.push_tokens_capture();
drop trigger if exists push_tokens_capture on public.users;
create trigger push_tokens_capture
  before insert or update of push_token on public.users
  for each row execute function public.push_tokens_capture();

-- The server's lookup: push_tokens only.
create or replace function public.fetch_user_push_token(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(t.token), '') from public.push_tokens t where t.user_id = p_user_id;
$$;

revoke all on function public.fetch_user_push_token(uuid) from public, anon, authenticated;
grant execute on function public.fetch_user_push_token(uuid) to service_role;

-- 4. Installed apps' in-app notices become server events -------------------

-- Same name, arguments and result as before, so installed versions keep
-- calling it. Each row is read only as "this happened": the event, the
-- booking, and — for a new booking or a chat — the person. The server checks
-- the caller may make that event happen, writes the text, and sends it once.
create or replace function public.create_user_notifications(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  item   jsonb;
  target uuid;
  bid    uuid;
  typ    text;
  d      jsonb;
  msg    jsonb;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    begin
      target := nullif(item ->> 'user_id', '')::uuid;
      typ    := coalesce(nullif(btrim(item ->> 'type'), ''), 'general');
      d      := case when jsonb_typeof(item -> 'data') = 'object' then item -> 'data' else '{}'::jsonb end;
      bid    := nullif(d ->> 'booking_id', '')::uuid;

      if target is null then
        null;
      elsif typ = 'new_booking' then
        -- one driver told about a booking: only if the server would tell him
        if bid is not null
           and exists (select 1 from public.bookings x
                        where x.id = bid
                          and (x.company_id = uid or public.is_admin_user())) then
          perform 1 from public.bookings x where x.id = bid for update;
          if exists (select 1 from public.booking_dispatch_candidates(bid) c where c.candidate_id = target)
             and not public.booking_driver_told(bid, target) then
            msg := public.booking_dispatch_message(bid);
            perform public.booking_notify(target, msg ->> 'title', msg ->> 'body', 'new_booking', msg -> 'data');
          end if;
        end if;
      elsif typ = 'booking_accepted' then
        perform public.notify_booking_event(bid, 'accepted');
      elsif typ = 'booking_driver_cancelled' then
        perform public.notify_booking_event(bid, 'driver_cancelled');
      elsif typ = 'booking_odometer' then
        perform public.notify_booking_event(bid, 'odometer', d ->> 'odometer_phase');
      elsif typ = 'booking_voucher' then
        perform public.notify_booking_event(bid,
          case when lower(coalesce(d ->> 'is_emergency_replacement', '')) = 'true' then 'emergency' else 'voucher' end);
      elsif typ = 'booking_updated' then
        perform public.notify_booking_event(bid, 'updated');
      elsif typ = 'booking_assigned' then
        perform public.notify_booking_event(bid, 'host_assigned');
      elsif typ = 'booking_completed_host' then
        perform public.notify_booking_event(bid, 'host_completed');
      elsif typ = 'chat_message' then
        perform public.notify_chat_message(target, null);
      elsif typ = 'fleet_invite' then
        perform public.notify_fleet_invite(nullif(d ->> 'fleet_id', '')::uuid);
      elsif typ = 'profile_viewed' then
        perform public.notify_profile_viewed(target);
      elsif target = uid then
        -- a note to oneself, in-app only, as before
        insert into public.notifications (user_id, type, title, body, data)
        values (target, typ, left(coalesce(item ->> 'title', ''), 120), left(coalesce(item ->> 'body', ''), 900), d);
      end if;
      -- any other type to someone else: not sent. (The events above decide
      -- their own recipients, so a company's copy of its own voucher, which
      -- installed apps send as a row of its own, is not doubled.)
    exception
      when insufficient_privilege or invalid_parameter_value or invalid_text_representation then
        -- not the caller's to send, or not a real booking/person: skipped,
        -- as the old function skipped the rows it refused
        null;
    end;
  end loop;
end;
$$;

revoke all on function public.create_user_notifications(jsonb) from public, anon;
grant execute on function public.create_user_notifications(jsonb) to authenticated, service_role;

comment on table public.push_tokens is
  'P0-4: the Expo push token of each user''s phone, one account per phone. Only the server reads it. profiles.push_token / users.push_token are always empty since part B: the app still writes them, a trigger moves the token here.';
comment on column public.profiles.push_token is
  'Always empty since P0-4 part B: the app writes its token here and the push_tokens_capture trigger moves it to public.push_tokens. Kept because installed app versions still select it.';

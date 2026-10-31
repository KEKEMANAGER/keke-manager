-- Undo P0-4 part B (staged/20261101090100_push_tokens_private).
--
-- Tokens go back into profiles.push_token (users.push_token for an account
-- with no profile row), part A's mirror takes over again, and
-- create_user_notifications() is the production definition once more.
-- Part A stays in place.

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.profiles'::regclass and tgname = 'push_tokens_capture') then
    raise exception 'P0-4 part B is not applied: nothing to undo';
  end if;
end
$$;

drop trigger if exists push_tokens_capture on public.profiles;
drop trigger if exists push_tokens_capture on public.users;
drop function if exists public.push_tokens_capture();

update public.profiles p
   set push_token = t.token
  from public.push_tokens t
 where t.user_id = p.id;
update public.users u
   set push_token = t.token
  from public.push_tokens t
 where t.user_id = u.id
   and not exists (select 1 from public.profiles p where p.id = u.id);

drop index if exists public.push_tokens_token_key;

drop trigger if exists push_tokens_mirror on public.profiles;
create trigger push_tokens_mirror
  after insert or update of push_token on public.profiles
  for each row execute function public.push_tokens_mirror();
drop trigger if exists push_tokens_mirror on public.users;
create trigger push_tokens_mirror
  after insert or update of push_token on public.users
  for each row execute function public.push_tokens_mirror();

-- part A's lookup (push_tokens first, then the columns)
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

-- production definition
CREATE OR REPLACE FUNCTION public.create_user_notifications(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  target uuid;
  bid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    target := NULLIF(item->>'user_id', '')::uuid;
    IF target IS NULL THEN
      CONTINUE;
    END IF;

    bid := NULL;
    IF COALESCE(item->'data'->>'booking_id', '') <> '' THEN
      bid := (item->'data'->>'booking_id')::uuid;
    END IF;

    IF NOT public.user_may_notify(target, bid) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      target,
      COALESCE(item->>'type', 'general'),
      COALESCE(item->>'title', ''),
      COALESCE(item->>'body', ''),
      COALESCE(item->'data', '{}'::jsonb)
    );
  END LOOP;
END;
$function$;
revoke all on function public.create_user_notifications(jsonb) from public, anon;
grant execute on function public.create_user_notifications(jsonb) to authenticated, service_role;

comment on table public.push_tokens is
  'P0-4: the Expo push token of each user''s phone. Only the server reads it (service_role and SECURITY DEFINER functions); no client role has any right on it.';
comment on column public.profiles.push_token is null;

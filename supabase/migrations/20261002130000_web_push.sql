-- Web push for the browser.
--
-- Companies work from kekemanager.com, not from the app: of the five company
-- accounts on the platform, none has an Expo push token, so today a tour
-- operator is told about nothing at all. A browser subscription is the first
-- channel that actually reaches them.
--
-- The sending itself lives in the `web-push` Edge Function, because the payload
-- has to be encrypted per subscription (RFC 8291) and signed with VAPID
-- (RFC 8292). This file is only the storage and the call out to it.

create table if not exists public.web_push_subscriptions (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- the push service's URL for this browser; it is the subscription's identity,
  -- so re-subscribing the same browser updates the row instead of adding one
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  integer not null default 0
);

create index if not exists web_push_subscriptions_user_idx
  on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

-- A person may see and remove their own browsers, and nothing else. Writes go
-- through the Edge Function with the service role, which bypasses RLS.
drop policy if exists web_push_own_select on public.web_push_subscriptions;
create policy web_push_own_select on public.web_push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists web_push_own_delete on public.web_push_subscriptions;
create policy web_push_own_delete on public.web_push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── calling the sender ──────────────────────────────────────────────────────

/**
 * Hands one notification to the web-push function for delivery to every browser
 * the user has subscribed.
 *
 * Fire-and-forget on purpose: a push that cannot be delivered must never hold
 * up, or roll back, the thing that caused it. The notification row is already
 * written by the time this runs, so nothing is lost if the push fails.
 */
create or replace function public.send_web_push(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  v_url    text;
  v_count  integer;
begin
  if p_user_id is null then
    return;
  end if;

  select count(*) into v_count
  from public.web_push_subscriptions
  where user_id = p_user_id;
  if v_count = 0 then
    return;  -- nothing subscribed; no point waking the function
  end if;

  select value into v_secret from public.app_settings where key = 'web_push_hook_secret';
  if v_secret is null or v_secret = '' then
    return;  -- the function has not generated its keys yet
  end if;

  select value into v_url from public.app_settings where key = 'web_push_url';
  if v_url is null or v_url = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-keke-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'user_id', p_user_id,
      'title', coalesce(p_title, 'KEKE Manager'),
      'body', coalesce(p_body, ''),
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
end;
$$;

revoke execute on function public.send_web_push(uuid, text, text, jsonb) from public, anon, authenticated;

-- ── the one funnel every notification already goes through ──────────────────

create or replace function public.booking_notify(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tok text;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, title, body, type, is_read, data)
  values (p_user_id, p_title, p_body, p_type, false, coalesce(p_data, '{}'::jsonb));

  tok := public.fetch_user_push_token(p_user_id);
  if tok is not null then
    perform public.send_expo_push(tok, p_title, p_body, coalesce(p_data, '{}'::jsonb));
  end if;

  -- Same notification, the other channel. A person may well have both the app
  -- and the site open; the browser notification is tagged by type so the two do
  -- not stack up as duplicates on the same desktop.
  perform public.send_web_push(p_user_id, p_title, p_body,
    coalesce(p_data, '{}'::jsonb) || jsonb_build_object('type', p_type));
end;
$$;

revoke execute on function public.booking_notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

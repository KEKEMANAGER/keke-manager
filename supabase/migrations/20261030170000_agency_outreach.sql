-- Agency outreach: the introduction letter to Georgian tour companies
-- (GNTA registry list), sent one company at a time from info@kekemanager.com
-- through Zoho by the agency-outreach edge function.
--
-- The cron wakes the function every 4 minutes on weekdays, 09:00-19:00
-- Tbilisi, and only while app_settings.outreach_enabled = 'true'.

create table if not exists public.outreach_recipients (
  id bigint generated always as identity primary key,
  campaign text not null,
  agency text not null,
  emails text[] not null,
  category text,
  town text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'opted_out')),
  attempts int not null default 0,
  note text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_recipients_campaign_emails
  on public.outreach_recipients (campaign, emails);
create index if not exists outreach_recipients_pending
  on public.outreach_recipients (campaign, id) where status = 'pending';

alter table public.outreach_recipients enable row level security;
revoke all on public.outreach_recipients from anon, authenticated;

-- Next company to write to; rows left "sending" by a crashed run come back.
create or replace function public.claim_outreach_recipient(p_campaign text)
returns public.outreach_recipients
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.outreach_recipients;
begin
  update public.outreach_recipients
     set status = 'pending', updated_at = now()
   where campaign = p_campaign
     and status = 'sending'
     and updated_at < now() - interval '15 minutes';

  select * into r
    from public.outreach_recipients
   where campaign = p_campaign and status = 'pending'
   order by id
   limit 1
   for update skip locked;
  if not found then
    return null;
  end if;

  update public.outreach_recipients
     set status = 'sending', attempts = attempts + 1, updated_at = now()
   where id = r.id
  returning * into r;
  return r;
end;
$$;
revoke all on function public.claim_outreach_recipient(text) from public, anon, authenticated;
grant execute on function public.claim_outreach_recipient(text) to service_role;

-- A company that joined KEKE in the meantime is not written to: same address,
-- or the same company domain (free mail providers do not count).
create or replace function public.outreach_is_existing_user(p_emails text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select lower(trim(e)) as email, split_part(lower(trim(e)), '@', 2) as domain
      from unnest(p_emails) e
  )
  select exists (
    select 1
      from public.users u, r
     where lower(trim(u.email)) = r.email
        or (split_part(lower(trim(u.email)), '@', 2) = r.domain
            and r.domain not in ('gmail.com', 'yahoo.com', 'mail.ru', 'outlook.com', 'hotmail.com',
                                 'icloud.com', 'bk.ru', 'inbox.ru', 'list.ru', 'yandex.ru', 'yandex.com',
                                 'internet.ru', 'mail.com', 'live.com', 'aol.com', 'ymail.com',
                                 'rambler.ru', 'googlemail.com'))
  );
$$;
revoke all on function public.outreach_is_existing_user(text[]) from public, anon, authenticated;
grant execute on function public.outreach_is_existing_user(text[]) to service_role;

insert into public.app_settings (key, value) values
  ('outreach_enabled', 'false'),
  ('outreach_url', 'https://brrjuxgxmpgvkddcuaad.supabase.co/functions/v1/agency-outreach')
on conflict (key) do nothing;

insert into public.app_settings (key, value)
select 'outreach_hook_secret',
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where not exists (select 1 from public.app_settings where key = 'outreach_hook_secret');

create or replace function public.wake_agency_outreach()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if coalesce((select value from public.app_settings where key = 'outreach_enabled'), 'false') <> 'true' then
    return;
  end if;
  if not exists (select 1 from public.outreach_recipients where status = 'pending') then
    return;
  end if;
  select value into v_url from public.app_settings where key = 'outreach_url';
  select value into v_secret from public.app_settings where key = 'outreach_hook_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{"action":"run"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-keke-outreach-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function public.wake_agency_outreach() from public, anon, authenticated;

select cron.schedule('agency-outreach', '*/4 5-14 * * 1-5', $cron$select public.wake_agency_outreach();$cron$);

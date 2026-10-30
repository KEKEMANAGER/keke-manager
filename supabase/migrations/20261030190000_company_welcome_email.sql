-- "Your company is registered": an email to every tour company right after
-- it signs up, sent by the account-emails edge function through Resend.
--
-- The account row appears first (auth sign-up), the app sets role = company
-- a moment later; both moments wake the function, and the unique key keeps
-- it to one email per company. A cron retries what failed.

create table if not exists public.account_emails (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('company_welcome')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  recipient text,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, kind)
);

alter table public.account_emails enable row level security;
revoke all on public.account_emails from anon, authenticated;

create or replace function public.claim_account_emails(p_limit int)
returns setof public.account_emails
language sql
security definer
set search_path = public
as $$
  update public.account_emails a
     set status = 'sending', attempts = a.attempts + 1, updated_at = now()
   where a.id in (
     select id
       from public.account_emails
      where (status in ('queued', 'failed')
             or (status = 'sending' and updated_at < now() - interval '10 minutes'))
        and attempts < 5
      order by id
      limit greatest(p_limit, 1)
      for update skip locked
   )
  returning a.*;
$$;
revoke all on function public.claim_account_emails(int) from public, anon, authenticated;
grant execute on function public.claim_account_emails(int) to service_role;

insert into public.app_settings (key, value) values
  ('account_email_url', 'https://brrjuxgxmpgvkddcuaad.supabase.co/functions/v1/account-emails')
on conflict (key) do nothing;

insert into public.app_settings (key, value)
select 'account_email_hook_secret',
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where not exists (select 1 from public.app_settings where key = 'account_email_hook_secret');

create or replace function public.wake_account_emails()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_settings where key = 'account_email_url';
  select value into v_secret from public.app_settings where key = 'account_email_hook_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-keke-account-secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.wake_account_emails() from public, anon, authenticated;

create or replace function public.queue_company_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  begin
    if tg_op = 'INSERT' then
      v_role := new.role;
      if v_role is null then
        select u.raw_user_meta_data ->> 'role' into v_role from auth.users u where u.id = new.id;
      end if;
    else
      if new.role is not distinct from old.role then
        return new;
      end if;
      -- An admin turning an old account into a company is not a sign-up.
      if new.created_at is not null and new.created_at < now() - interval '1 day' then
        return new;
      end if;
      v_role := new.role;
    end if;

    if v_role = 'company' then
      insert into public.account_emails (user_id, kind)
      values (new.id, 'company_welcome')
      on conflict (user_id, kind) do nothing;
      perform public.wake_account_emails();
    end if;
  exception when others then
    null; -- an email must never stand in the way of signing up
  end;
  return new;
end;
$$;

create or replace trigger users_company_welcome_insert
  after insert on public.users
  for each row execute function public.queue_company_welcome_email();

create or replace trigger users_company_welcome_role
  after update of role on public.users
  for each row execute function public.queue_company_welcome_email();

select cron.schedule(
  'account-emails-retry',
  '*/5 * * * *',
  $cron$
    select public.wake_account_emails()
     where exists (
       select 1 from public.account_emails
        where status in ('queued', 'failed')
          and attempts < 5
          and created_at > now() - interval '2 days'
     );
  $cron$
);

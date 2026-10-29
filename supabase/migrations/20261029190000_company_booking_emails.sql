-- Booking emails for companies.
--
-- Companies asked to get every booking by email: when a driver confirms it, when
-- the trip starts and when it ends, each time with the voucher. A trigger on
-- bookings.status queues one row per moment here and wakes the booking-emails
-- edge function, which sends through Resend. A five-minute job retries what
-- failed. An email can never stop a booking from changing status.

create table if not exists public.booking_emails (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  event       text not null check (event in ('confirmed', 'started', 'completed')),
  -- the driver at that moment: a booking handed to another driver is confirmed again
  driver_id   uuid,
  status      text not null default 'queued'
              check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  recipient   text,
  attempts    integer not null default 0,
  last_error  text,
  provider_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create unique index if not exists booking_emails_once
  on public.booking_emails (booking_id, event, coalesce(driver_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists booking_emails_open
  on public.booking_emails (created_at)
  where status in ('queued', 'sending', 'failed');

alter table public.booking_emails enable row level security;
revoke all on public.booking_emails from anon, authenticated;
-- No policies: only the edge function (service role) and the functions below use it.

-- Where the function lives, and the secret the database calls it with (generated
-- here, never typed anywhere).
insert into public.app_settings (key, value)
values ('booking_email_url', 'https://brrjuxgxmpgvkddcuaad.supabase.co/functions/v1/booking-emails')
on conflict (key) do update set value = excluded.value, updated_at = now();

insert into public.app_settings (key, value)
values ('booking_email_hook_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- ── wake the function ───────────────────────────────────────────────────────

create or replace function public.wake_booking_emails()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url from public.app_settings where key = 'booking_email_url';
  select value into v_secret from public.app_settings where key = 'booking_email_hook_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-keke-email-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.wake_booking_emails() from public, anon, authenticated;

-- ── hand out work: each row goes to exactly one sender ──────────────────────

create or replace function public.claim_booking_emails(p_limit integer default 20)
returns setof public.booking_emails
language sql
security definer
set search_path to 'public'
as $$
  update public.booking_emails e
     set status = 'sending', attempts = e.attempts + 1, updated_at = now()
   where e.id in (
     select q.id
       from public.booking_emails q
      where (q.status in ('queued', 'failed')
             or (q.status = 'sending' and q.updated_at < now() - interval '10 minutes'))
        and q.attempts < 5
      order by q.created_at
      limit greatest(1, least(coalesce(p_limit, 20), 50))
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function public.claim_booking_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_booking_emails(integer) to service_role;

-- ── the trigger ─────────────────────────────────────────────────────────────

create or replace function public.bookings_queue_company_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  v_event := case new.status
    when 'accepted'    then 'confirmed'
    when 'in_progress' then 'started'
    when 'completed'   then 'completed'
  end;

  -- A group booking's master row has no driver; each car's own row is emailed.
  if v_event is null or new.company_id is null or new.driver_id is null
     or coalesce(new.is_group_master, false) then
    return null;
  end if;

  insert into public.booking_emails (booking_id, event, driver_id)
  values (new.id, v_event, new.driver_id)
  on conflict do nothing;

  if found then
    perform public.wake_booking_emails();
  end if;
  return null;
exception when others then
  raise warning 'booking email not queued for %: %', new.id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists bookings_queue_company_email on public.bookings;
create trigger bookings_queue_company_email
  after update of status on public.bookings
  for each row
  execute function public.bookings_queue_company_email();

-- ── retries ─────────────────────────────────────────────────────────────────

select cron.unschedule('booking-emails-retry')
 where exists (select 1 from cron.job where jobname = 'booking-emails-retry');

select cron.schedule(
  'booking-emails-retry',
  '*/5 * * * *',
  $cron$
    select public.wake_booking_emails()
     where exists (
       select 1 from public.booking_emails
        where (status in ('queued', 'failed')
               or (status = 'sending' and updated_at < now() - interval '10 minutes'))
          and attempts < 5
          and created_at > now() - interval '1 day'
     );
  $cron$
);

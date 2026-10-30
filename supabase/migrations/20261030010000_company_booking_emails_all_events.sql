-- Booking emails for every moment of a booking.
--
-- Akaki: everything the company or the driver does should reach the company by
-- email — the company creates, edits or cancels a booking, a driver confirms,
-- declines or is replaced, picks the passengers up, drops them off, ends the
-- trip. Each email carries the voucher and its PDF (booking-emails function).
--
-- One queue row per moment, kept unique by a dedupe key: a status moment once
-- per driver, an edit once per booking_history row, a pickup / drop-off once per
-- trip_events row. Edits wait two minutes so quick successive edits go out as one
-- email. The test scope (app_settings.booking_email_scope) still decides which
-- companies get them.

alter table public.booking_emails drop constraint if exists booking_emails_event_check;
alter table public.booking_emails add constraint booking_emails_event_check check (event in (
  'created', 'edited', 'confirmed', 'driver_changed', 'rejected', 'cancelled',
  'started', 'pickup', 'dropoff', 'completed', 'voucher'
));

alter table public.booking_emails add column if not exists dedupe_key text;
alter table public.booking_emails add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.booking_emails add column if not exists send_after timestamptz not null default now();

update public.booking_emails
   set dedupe_key = event || ':' || coalesce(driver_id::text, '')
 where dedupe_key is null;
alter table public.booking_emails alter column dedupe_key set not null;

drop index if exists public.booking_emails_once;
create unique index if not exists booking_emails_dedupe on public.booking_emails (booking_id, dedupe_key);

-- ── queue one moment (scope check, no duplicates, wake the sender) ──────────

create or replace function public.queue_booking_email(
  p_booking_id uuid,
  p_event text,
  p_driver_id uuid,
  p_dedupe text,
  p_details jsonb default '{}'::jsonb,
  p_delay interval default interval '0'
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company uuid;
  v_scope   text;
  v_email   text;
begin
  select company_id into v_company from public.bookings where id = p_booking_id;
  if v_company is null then
    return;
  end if;

  select lower(replace(coalesce(value, 'all'), ' ', '')) into v_scope
    from public.app_settings where key = 'booking_email_scope';
  if coalesce(v_scope, 'all') <> 'all' then
    select lower(trim(coalesce(nullif(trim(u.company_email), ''), u.email))) into v_email
      from public.users u where u.id = v_company;
    if v_email is null or not (v_email = any (string_to_array(v_scope, ','))) then
      return;
    end if;
  end if;

  insert into public.booking_emails (booking_id, event, driver_id, dedupe_key, details, send_after)
  values (p_booking_id, p_event, p_driver_id, p_dedupe, coalesce(p_details, '{}'::jsonb),
          now() + coalesce(p_delay, interval '0'))
  on conflict do nothing;

  if found and coalesce(p_delay, interval '0') <= interval '0' then
    perform public.wake_booking_emails();
  end if;
end;
$$;

revoke execute on function public.queue_booking_email(uuid, text, uuid, text, jsonb, interval) from public, anon, authenticated;

-- ── bookings: created, status moments, a new driver ─────────────────────────

create or replace function public.bookings_queue_company_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    -- a group's cars are announced once, by the group's own row
    if new.parent_booking_id is null then
      perform public.queue_booking_email(new.id, 'created', new.driver_id, 'created');
    end if;
    return null;
  end if;

  -- another driver took over a booking that already had one
  if new.driver_id is not null and old.driver_id is not null
     and new.driver_id is distinct from old.driver_id
     and old.status in ('accepted', 'in_progress')
     and new.status in ('accepted', 'in_progress') then
    perform public.queue_booking_email(new.id, 'driver_changed', new.driver_id,
      'driver_changed:' || new.driver_id::text,
      jsonb_build_object('old_driver_id', old.driver_id));
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'accepted' and new.driver_id is not null
     and not coalesce(new.is_group_master, false) then
    perform public.queue_booking_email(new.id, 'confirmed', new.driver_id, 'confirmed:' || new.driver_id::text);
  elsif new.status = 'in_progress' and new.driver_id is not null then
    perform public.queue_booking_email(new.id, 'started', new.driver_id, 'started:' || new.driver_id::text);
  elsif new.status = 'completed' and new.driver_id is not null then
    perform public.queue_booking_email(new.id, 'completed', new.driver_id, 'completed:' || new.driver_id::text);
  elsif new.status = 'cancelled' then
    -- a car of a group waits a minute: when the whole group is being cancelled
    -- the group's own email covers it and the sender skips the car's
    perform public.queue_booking_email(new.id, 'cancelled', coalesce(new.driver_id, old.driver_id), 'cancelled',
      jsonb_build_object('cancelled_by', new.cancelled_by, 'old_driver_id', old.driver_id, 'old_status', old.status),
      case when new.parent_booking_id is not null then interval '1 minute' else interval '0' end);
  elsif new.status = 'rejected' then
    perform public.queue_booking_email(new.id, 'rejected', old.driver_id, 'rejected',
      jsonb_build_object('old_driver_id', old.driver_id));
  end if;
  return null;
exception when others then
  raise warning 'booking email not queued for %: %', new.id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists bookings_queue_company_email on public.bookings;
create trigger bookings_queue_company_email
  after insert or update of status, driver_id on public.bookings
  for each row
  execute function public.bookings_queue_company_email();

-- ── company edits (booking_history rows) ────────────────────────────────────

create or replace function public.booking_history_queue_company_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- a group's edit is announced once, by the group's own row; the copies
  -- written to keep each car in step are not news to the company
  if new.reason = 'convoy_master_sync' then
    return null;
  end if;
  perform public.queue_booking_email(new.booking_id, 'edited', null, 'edited:' || new.id::text,
    jsonb_build_object('changes', new.changes, 'reason', new.reason), interval '2 minutes');
  return null;
exception when others then
  raise warning 'edit email not queued for %: %', new.booking_id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists booking_history_queue_company_email on public.booking_history;
create trigger booking_history_queue_company_email
  after insert on public.booking_history
  for each row
  execute function public.booking_history_queue_company_email();

-- ── passengers picked up / dropped off (trip_events rows) ───────────────────

create or replace function public.trip_events_queue_company_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
$$;

drop trigger if exists trip_events_queue_company_email on public.trip_events;
create trigger trip_events_queue_company_email
  after insert on public.trip_events
  for each row
  execute function public.trip_events_queue_company_email();

-- ── hand out work that is due ───────────────────────────────────────────────

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
        and q.send_after <= now()
      order by q.created_at
      limit greatest(1, least(coalesce(p_limit, 20), 50))
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function public.claim_booking_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_booking_emails(integer) to service_role;

-- every minute now, so a delayed edit goes out soon after its two minutes
select cron.unschedule('booking-emails-retry')
 where exists (select 1 from cron.job where jobname = 'booking-emails-retry');

select cron.schedule(
  'booking-emails-retry',
  '* * * * *',
  $cron$
    select public.wake_booking_emails()
     where exists (
       select 1 from public.booking_emails
        where (status in ('queued', 'failed')
               or (status = 'sending' and updated_at < now() - interval '10 minutes'))
          and attempts < 5
          and send_after <= now()
          and created_at > now() - interval '1 day'
     );
  $cron$
);

-- Server-side delivery for "new booking" push.
--
-- Why: every push in the app was sent by the *sender's phone* (a fetch to
-- exp.host from `lib/expoPush.ts`), and the second dispatch wave was a
-- `setTimeout` inside that same app. A company that creates a booking and then
-- locks the phone kills the send; a booking created by an Edge Function
-- (PDF/Docx import) never had a phone to send from at all. Measured on live
-- data: 4 of the last 15 bookings produced any `new_booking` notification.
--
-- This migration adds two server-side paths that need no app to be running:
--   1. `push_outbox` + `flush_push_outbox()` — a deferred queue, so dispatch
--      wave 2 survives the sender closing the app.
--   2. `dispatch_new_booking_push()` + `dispatch_missed_new_bookings()` — a
--      safety net that, ~1 minute after a booking is created, checks whether
--      anybody was actually notified and does the dispatch itself if not.
--
-- The client keeps doing the precise matching for wave 1. Nothing here runs
-- when that worked, so there is no double-notification in the normal case.

-- ---------------------------------------------------------------------------
-- 1. Deferred push queue
-- ---------------------------------------------------------------------------

create table if not exists public.push_outbox (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid references public.bookings(id) on delete cascade,
  user_id     uuid,
  token       text        not null,
  title       text        not null,
  body        text        not null default '',
  data        jsonb       not null default '{}'::jsonb,
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists push_outbox_due_idx
  on public.push_outbox (send_after)
  where sent_at is null;

alter table public.push_outbox enable row level security;

-- No client reads this table; rows are enqueued through `enqueue_booking_push`
-- (security definer) and consumed by the cron worker.
revoke all on public.push_outbox from anon, authenticated;

/**
 * Enqueue a delayed push for a booking the caller is party to.
 * Used by the app for dispatch wave 2 instead of an in-app `setTimeout`.
 */
create or replace function public.enqueue_booking_push(
  p_booking_id     uuid,
  p_tokens         text[],
  p_title          text,
  p_body           text,
  p_data           jsonb default '{}'::jsonb,
  p_delay_seconds  int   default 180
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  b       record;
  n       int  := 0;
  tok     text;
  delay   int  := least(greatest(coalesce(p_delay_seconds, 180), 0), 3600);
begin
  if caller is null or p_booking_id is null then
    return 0;
  end if;

  select id, company_id, driver_id into b
    from public.bookings where id = p_booking_id;
  if not found then
    return 0;
  end if;
  if caller <> coalesce(b.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and caller <> coalesce(b.driver_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    return 0;
  end if;

  foreach tok in array coalesce(p_tokens, array[]::text[]) loop
    tok := trim(coalesce(tok, ''));
    continue when tok = '';
    insert into public.push_outbox (booking_id, token, title, body, data, send_after)
    values (
      p_booking_id,
      tok,
      coalesce(p_title, 'KEKE Manager'),
      coalesce(p_body, ''),
      coalesce(p_data, '{}'::jsonb),
      now() + make_interval(secs => delay)
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, int)
  to authenticated;

/** Sends every due row. Skips new-booking pushes for bookings already taken. */
create or replace function public.flush_push_outbox(p_limit int default 300)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  sent  int := 0;
  still boolean;
begin
  for r in
    select o.*
      from public.push_outbox o
     where o.sent_at is null
       and o.send_after <= now()
     order by o.send_after
     limit greatest(coalesce(p_limit, 300), 1)
  loop
    still := true;

    if r.booking_id is not null and (r.data ->> 'type') = 'new_booking' then
      select (b.status = 'pending' and b.driver_id is null)
        into still
        from public.bookings b
       where b.id = r.booking_id;
      still := coalesce(still, false);
    end if;

    if still then
      perform public.send_expo_push(r.token, r.title, r.body, r.data);
      sent := sent + 1;
    end if;

    update public.push_outbox set sent_at = now() where id = r.id;
  end loop;

  -- keep the table small
  delete from public.push_outbox
   where sent_at is not null and sent_at < now() - interval '3 days';

  return sent;
end;
$$;

revoke execute on function public.flush_push_outbox(int) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Safety net: nobody was notified about a new booking
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists dispatch_fallback_sent_at timestamptz;

/**
 * Notifies every driver who could take this booking, server side.
 *
 * Mirrors `fetchMatchingDriverPushRecipients` in `lib/notifications.ts` for the
 * filters that are hard requirements — verified driver, active approved vehicle
 * of the right type/class/capacity, spoken languages, requested driver category
 * — and deliberately skips the schedule-overlap filter: this only ever runs for
 * a booking nobody has heard about, where a false positive costs one decline
 * and a false negative costs the trip.
 *
 * Returns the number of drivers notified.
 */
create or replace function public.dispatch_new_booking_push(p_booking_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  b       record;
  d       record;
  w_start timestamptz;
  w_end   timestamptz;
  n       int := 0;
  v_title text;
  v_body  text;
  v_kind  text;
  v_route text;
  v_data  jsonb;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.status <> 'pending' then
    return 0;
  end if;

  -- same window the double-booking guard uses; null when the date is unparsable
  begin
    select bw.win_start, bw.win_end
      into w_start, w_end
      from public.booking_busy_window(p_booking_id) bw;
  exception when others then
    w_start := null;
    w_end   := null;
  end;

  v_kind := lower(coalesce(nullif(trim(b.kind), ''), nullif(trim(b.booking_type), ''), 'transfer'));
  if v_kind in ('day_tour', 'daytour') then
    v_title := 'KEKE · ახალი დღის ტური!';
  elsif v_kind = 'tour' then
    v_title := 'KEKE · ახალი ტური!';
  else
    v_title := 'KEKE · ახალი ტრანსფერი!';
  end if;

  v_route := public.booking_route_summary(b.from_location, b.to_location, b.route::text);
  v_body  := v_route || coalesce(' · ' || nullif(trim(b.date_display), ''), '');

  v_data := jsonb_build_object(
    'type', 'new_booking',
    'booking_id', b.id::text,
    'booking_kind', case when v_kind in ('tour', 'day_tour') then v_kind else 'transfer' end,
    'vehicle_type', coalesce(b.vehicle_type, ''),
    'vehicle_class', coalesce(b.vehicle_class, '')
  );

  for d in
    with matching_vehicles as (
      select v.id, v.driver_id
        from public.vehicles v
       where v.is_active = true
         and v.is_verified = true
         and v.verification_status = 'approved'
         and v.type = b.vehicle_type
         and v.class = b.vehicle_class
         and (nullif(trim(coalesce(b.requested_capacity_tier, '')), '') is null
              or v.capacity_tier = b.requested_capacity_tier)
    ),
    candidate_ids as (
      select driver_id as id from matching_vehicles where driver_id is not null
      union
      select f.sub_driver_id
        from public.driver_fleet f
        join matching_vehicles mv on mv.id = f.vehicle_id
       where f.status = 'accepted' and f.sub_driver_id is not null
    )
    select c.id,
           public.fetch_user_push_token(c.id) as token
      from candidate_ids c
      left join public.users u    on u.id = c.id
      left join public.profiles p on p.id = c.id
     where (b.driver_id is null or c.id = b.driver_id)
       and c.id is distinct from b.company_id
       and (u.is_verified = true or p.is_verified = true)
       -- hired drivers never get broadcast jobs
       and (b.driver_id is not null or coalesce(u.is_hired_driver, false) = false)
       -- requested category (mirrors driverMatchesRequestedCategory)
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
       -- required languages
       and (
         b.required_languages is null
         or array_length(b.required_languages, 1) is null
         or coalesce(u.languages, p.languages, array[]::text[]) && b.required_languages
       )
       -- already busy in this window (same rule as the double-booking guard)
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
       )
  loop
    if d.token is not null then
      perform public.booking_notify(d.id, v_title, v_body, 'new_booking', v_data);
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;

revoke execute on function public.dispatch_new_booking_push(uuid) from anon, authenticated;

/**
 * Runs every minute. A booking that is still open one minute after it was
 * created and has produced no `new_booking` notification at all was never
 * dispatched — the sender's app was closed, or it was created server side.
 */
create or replace function public.dispatch_missed_new_bookings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r     record;
  total int := 0;
begin
  for r in
    select b.id
      from public.bookings b
     where b.status = 'pending'
       and b.dispatch_fallback_sent_at is null
       and b.created_at < now() - interval '60 seconds'
       and b.created_at > now() - interval '2 hours'
       and not exists (
         select 1
           from public.notifications n
          where n.type = 'new_booking'
            and (n.data ->> 'booking_id') = b.id::text
       )
     order by b.created_at
     limit 20
  loop
    total := total + public.dispatch_new_booking_push(r.id);
    update public.bookings
       set dispatch_fallback_sent_at = now()
     where id = r.id;
  end loop;

  return total;
end;
$$;

revoke execute on function public.dispatch_missed_new_bookings() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Schedule
-- ---------------------------------------------------------------------------

select cron.unschedule('push-outbox-flush')
 where exists (select 1 from cron.job where jobname = 'push-outbox-flush');

select cron.schedule('push-outbox-flush', '* * * * *', $cron$select public.flush_push_outbox();$cron$);

select cron.unschedule('new-booking-dispatch-fallback')
 where exists (select 1 from cron.job where jobname = 'new-booking-dispatch-fallback');

select cron.schedule(
  'new-booking-dispatch-fallback',
  '* * * * *',
  $cron$select public.dispatch_missed_new_bookings();$cron$
);

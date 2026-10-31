-- P0-5 · A company cancels its own bookings — any it may — and a cancellation
-- tells the driver once and stays final.
--
-- Before (production, and after P0-1..P0-4):
--   * The app let a company cancel only a pending booking, and only from the
--     two newest cards on its dashboard; the full list and the booking's own
--     screen had no cancel at all. A booking a driver had accepted could not
--     be cancelled by its company.
--   * The database, meanwhile, let the company set any of its bookings to
--     'cancelled' by a direct update — a trip in progress, a finished one —
--     and set a cancelled one back to 'pending', after which a driver could
--     take it again.
--   * Nobody was told when the company cancelled: not the driver who had
--     accepted the job, not the one it was offered to, not the fleet owner
--     who gave it to his driver. The booking's change log got no line.
--   * The driver's calendar was already freed on every cancellation, by
--     bookings_after_status_change (production): that stays as it is.
--
-- After:
--   * cancel_booking_by_company(booking, reason): the booking's company (or an
--     admin) cancels it in one locked step, so it cannot cross a driver's
--     acceptance or the reminder worker's replacement:
--       pending (open, or offered to one driver), accepted → cancelled
--       in progress   → refused for the company (KEKE / an admin may cancel it)
--       completed, cancelled, declined → refused, nothing changes
--       a convoy      → every car not finished, then the convoy itself;
--                       refused while a car is on the road
--     It answers with a code the app shows (cancelled, already_cancelled,
--     already_completed, already_closed, trip_in_progress, convoy_in_progress,
--     forbidden, not_found).
--   * Every cancellation, by any path — this function, an installed app's
--     direct update, a driver, a convoy, an admin:
--       - second-wave pushes still waiting for it are dropped (P0-4 outbox);
--       - a line goes into booking_history (who, from which status, why);
--       - when the company or KEKE cancelled, the driver and his fleet owner
--         are told once, through the P0-4 server delivery. A driver's own
--         cancellation is announced to the company by his app, as before.
--   * A cancelled or completed booking stays so: no direct update from an app
--     changes its status any more (an admin still can). A trip in progress
--     changes status only by its driver (or an admin). A company changes a
--     booking's status only by cancelling it: not back to pending (a silent
--     unassign), not 'rejected', never empty — those skipped the driver's
--     notice and the change log. A convoy's coordinator row still follows its
--     cars, but is not cancelled while one of them is on the road.
--   * Who cancelled, and when, is written by the server only (it counts in
--     the driver's rating); the fleet owner on a booking is not set by a
--     direct update, and the fleet owner who is told is the driver's own,
--     from the fleet.
--
-- Needs P0-3 part A and P0-4 part A (checked below). Changes no rows.
-- Undo: supabase/rollback/20261101120000_company_cancellation_undo.sql
-- Tests: supabase/tests/run_p0_5_tests.sh (see supabase/tests/README.md)

-- 0. Preflight ------------------------------------------------------------------
do $$
declare
  got text;
begin
  if to_regprocedure('public.bookings_guard_direct_writes()') is null then
    raise exception 'P0-5 stopped: apply P0-3 part A (20261031180000_driver_eligibility) first';
  end if;
  if to_regprocedure('public.deliver_notification(uuid,text,text,text,jsonb,text)') is null then
    raise exception 'P0-5 stopped: apply P0-4 part A (20261101090000_push_tokens_server_delivery) first';
  end if;
  -- the calendar is freed by this production trigger; P0-5 relies on it
  select md5(replace(p.prosrc, E'\r', '')) into got
    from pg_proc p where p.oid = to_regprocedure('public.bookings_after_status_change()');
  if got is distinct from '60da1fc7d4f2205302402a7fccad518c' then
    raise exception 'P0-5 stopped: public.bookings_after_status_change() is not the version this migration was written against (found %)', got;
  end if;
end
$$;

-- 1. Final is final; an active trip is not the company's to stop -------------
--
-- Direct updates from the apps (current_user is the API role). Server
-- functions, the reminder worker and cron run as the owner and pass; so does
-- an admin. P0-3's bookings_guard_direct_writes already limits what a driver
-- may write; this adds what holds for everyone, the company included:
--   * a booking always has a status; a cancelled or completed one stays so;
--   * a trip in progress changes status only by its driver (or KEKE);
--   * a company changes a booking's status only by cancelling it — which
--     tells the driver and is logged — not back to pending, not 'rejected';
--   * who cancelled and when (cancelled_by, cancelled_at) is the server's to
--     write: bookings_stamp_lifecycle sets it from the caller, after this;
--   * the fleet owner on a booking (host_driver_id) is not set by an app.
-- A convoy's coordinator row may follow its cars (the app sets it from
-- them), but not to 'cancelled' while a car is on the road, and once
-- cancelled or completed it stays so too.
create or replace function public.bookings_guard_cancellation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.status is null then
    raise exception 'bookings: a booking always has a status' using errcode = '42501';
  end if;
  if public.is_admin_user() then
    return new;
  end if;
  uid := auth.uid();

  -- whatever the app sent, these stay as they are (an untouched cancellation
  -- stamp is empty, so bookings_stamp_lifecycle fills it from the caller)
  new.cancelled_by := old.cancelled_by;
  new.cancelled_at := old.cancelled_at;
  if new.host_driver_id is distinct from old.host_driver_id then
    raise exception 'bookings: the fleet owner on a booking is not set by a direct update'
      using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status in ('cancelled', 'completed') then
    raise exception 'bookings: a % booking stays %', old.status, old.status
      using errcode = '42501';
  end if;
  if coalesce(old.is_group_master, false) then
    if new.status = 'cancelled'
       and exists (select 1 from public.bookings x
                    where x.parent_booking_id = old.id and x.status = 'in_progress') then
      raise exception 'bookings: a convoy with a car on the road is not cancelled'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status = 'in_progress' and uid is distinct from old.driver_id then
    raise exception 'bookings: a trip in progress is ended by its driver or by KEKE, not by the company'
      using errcode = '42501';
  end if;
  if uid is not distinct from old.company_id and new.status is distinct from 'cancelled' then
    raise exception 'bookings: a company changes a booking''s status only by cancelling it (cancel_booking_by_company)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.bookings_guard_cancellation() from public, anon, authenticated;

drop trigger if exists bookings_guard_cancellation on public.bookings;
create trigger bookings_guard_cancellation
  before update of status, cancelled_by, cancelled_at, host_driver_id on public.bookings
  for each row execute function public.bookings_guard_cancellation();

-- 2. What every cancellation does --------------------------------------------

create or replace function public.bookings_after_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  reason text := nullif(btrim(coalesce(current_setting('keke.cancel_reason', true), '')), '');
  who    text;
  route  text;
  r      uuid;
begin
  if new.status is distinct from 'cancelled' or old.status is not distinct from 'cancelled' then
    return null;
  end if;

  -- (the driver's calendar block goes in bookings_after_status_change, which
  -- has always removed it on a cancellation)

  -- second-wave pushes still waiting for this booking are dropped
  update public.push_outbox
     set sent_at = now()
   where booking_id = new.id
     and sent_at is null;

  -- the booking's change log: who, from which status, why
  insert into public.booking_history (booking_id, changed_by, changes, reason)
  values (new.id, uid,
          jsonb_build_object('status', jsonb_build_object('old', old.status, 'new', 'cancelled', 'label', 'სტატუსი')),
          left('cancelled_by_' || coalesce(new.cancelled_by, 'unknown') || coalesce(': ' || reason, ''), 500));

  -- the company or KEKE cancelled: the driver and his fleet owner are told,
  -- once (a driver's own cancellation is announced to the company by his app).
  -- The fleet owner is the driver's own, from the fleet.
  if coalesce(new.is_group_master, false) or uid is null then
    return null;
  end if;
  if uid is distinct from new.company_id and not public.is_admin_user() then
    return null;
  end if;
  who   := case when uid = new.company_id then 'კომპანიამ' else 'KEKE-მ' end;
  route := public.booking_route_summary(new.from_location, new.to_location, new.route::text)
           || coalesce(' · ' || nullif(btrim(new.date_display), ''), '');
  for r in
    select distinct x
      from unnest(array[
             old.driver_id,
             (select f.host_driver_id from public.driver_fleet f
               where f.sub_driver_id = old.driver_id and f.status = 'accepted'
               order by f.created_at desc limit 1)]) x
     where x is not null and x is distinct from uid
  loop
    perform public.deliver_notification(r, 'KEKE · ჯავშანი გაუქმდა',
      concat_ws(E'\n', who || ' გააუქმა ჯავშანი', route),
      'booking_cancelled',
      jsonb_build_object('booking_id', new.id::text, 'cancelled_by', coalesce(new.cancelled_by, '')),
      'cancelled');
  end loop;
  return null;
end;
$$;

revoke all on function public.bookings_after_cancel() from public, anon, authenticated;

drop trigger if exists bookings_after_cancel on public.bookings;
create trigger bookings_after_cancel
  after update of status on public.bookings
  for each row execute function public.bookings_after_cancel();

-- 3. A convoy's coordinator row follows its cars (the app's own rule) ----------

create or replace function public.sync_convoy_master_status(p_master_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  st   text[];
  next text;
begin
  select array_agg(x.status) into st from public.bookings x where x.parent_booking_id = p_master_id;
  if st is null then
    return;
  end if;
  -- the app's rule (lib/groupBooking.ts deriveConvoyMasterStatus), except
  -- that a convoy whose cars are all finished, some done and some cancelled,
  -- is completed (the app's rule left it 'pending', as if still open)
  next := case
    when 'completed' = all (st) then 'completed'
    when 'in_progress' = any (st) then 'in_progress'
    when 'accepted' = any (st) then 'accepted'
    when 'pending' = any (st) then 'pending'
    when 'completed' = any (st) then 'completed'
    else 'cancelled'
  end;
  update public.bookings
     set status = next, updated_at = now()
   where id = p_master_id
     and coalesce(is_group_master, false)
     and status not in ('cancelled', 'completed')
     and status is distinct from next;
end;
$$;

revoke all on function public.sync_convoy_master_status(uuid) from public, anon, authenticated;
grant execute on function public.sync_convoy_master_status(uuid) to service_role;

-- 4. The company's cancel ------------------------------------------------------

create or replace function public.cancel_booking_by_company(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  b     public.bookings;
  par   uuid;
  admin boolean;
  why   text;
  n     int := 0;
begin
  if uid is null then
    raise exception 'cancel_booking_by_company: sign in first' using errcode = '42501';
  end if;
  if p_booking_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'ჯავშანი ვერ მოიძებნა');
  end if;

  -- locked: a driver's acceptance, the reminder worker's replacement and a
  -- second tap all wait here, and each sees the other's result. A convoy's
  -- own row is always locked before its cars, so cancelling a convoy and one
  -- of its cars at the same moment wait for each other instead of deadlocking.
  select x.parent_booking_id into par from public.bookings x where x.id = p_booking_id;
  if par is not null then
    perform 1 from public.bookings x where x.id = par for update;
  end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'ჯავშანი ვერ მოიძებნა');
  end if;
  admin := public.is_admin_user();
  if uid is distinct from b.company_id and not admin then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'ეს ჯავშანი თქვენი კომპანიის არ არის');
  end if;
  why := left(coalesce(btrim(p_reason), ''), 300);

  if coalesce(b.is_group_master, false) then
    -- a convoy: its cars, locked in one order, then the convoy itself
    perform 1 from public.bookings x where x.parent_booking_id = b.id order by x.id for update;
    if exists (select 1 from public.bookings x where x.parent_booking_id = b.id and x.status = 'in_progress') then
      return jsonb_build_object('ok', false, 'code', 'convoy_in_progress',
        'message', 'გაუქმება შეუძლებელია — ერთ-ერთი მანქანა უკვე გზაშია');
    end if;
    if not exists (select 1 from public.bookings x
                    where x.parent_booking_id = b.id and x.status in ('pending', 'accepted')) then
      -- no car left to cancel: the convoy row follows its cars (a convoy
      -- without cars is cancelled itself, as the app does)
      if exists (select 1 from public.bookings x where x.parent_booking_id = b.id) then
        perform public.sync_convoy_master_status(b.id);
      elsif b.status not in ('cancelled', 'completed') then
        perform set_config('keke.cancel_reason', why, true);
        update public.bookings
           set status = 'cancelled', cancelled_by = null, cancelled_at = null, updated_at = now()
         where id = b.id;
        perform set_config('keke.cancel_reason', '', true);
        return jsonb_build_object('ok', true, 'code', 'cancelled', 'previous_status', b.status, 'cancelled_cars', 0,
          'message', 'ჯავშანი გაუქმდა');
      end if;
      select x.status into b.status from public.bookings x where x.id = b.id;
      return jsonb_build_object('ok', false,
        'code', case b.status when 'cancelled' then 'already_cancelled'
                              when 'completed' then 'already_completed' else 'already_closed' end,
        'message', case b.status when 'cancelled' then 'ჯავშანი უკვე გაუქმებულია'
                                 when 'completed' then 'ჯავშანი უკვე დასრულებულია' else 'ჯავშანი ვერ გაუქმდება' end);
    end if;
    -- the reason reaches the change log through bookings_after_cancel, for
    -- these updates only; the stamp is cleared so it names this caller
    perform set_config('keke.cancel_reason', why, true);
    update public.bookings
       set status = 'cancelled', cancelled_by = null, cancelled_at = null, updated_at = now()
     where parent_booking_id = b.id
       and status in ('pending', 'accepted');
    get diagnostics n = row_count;
    if b.status not in ('cancelled', 'completed') then
      update public.bookings
         set status = 'cancelled', cancelled_by = null, cancelled_at = null, updated_at = now()
       where id = b.id;
    end if;
    perform set_config('keke.cancel_reason', '', true);
    return jsonb_build_object('ok', true, 'code', 'cancelled', 'previous_status', b.status, 'cancelled_cars', n,
      'message', 'ჯავშანი გაუქმდა');
  end if;

  if b.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'code', 'already_cancelled', 'message', 'ჯავშანი უკვე გაუქმებულია');
  elsif b.status = 'completed' then
    return jsonb_build_object('ok', false, 'code', 'already_completed', 'message', 'ჯავშანი უკვე დასრულებულია');
  elsif b.status = 'rejected' then
    return jsonb_build_object('ok', false, 'code', 'already_closed', 'message', 'ჯავშანი უკვე დახურულია');
  elsif b.status = 'in_progress' and not admin then
    return jsonb_build_object('ok', false, 'code', 'trip_in_progress',
      'message', 'მგზავრობა უკვე დაწყებულია — გაუქმებისთვის დაუკავშირდით მძღოლს ან KEKE-ს');
  elsif b.status not in ('pending', 'accepted', 'in_progress') then
    return jsonb_build_object('ok', false, 'code', 'already_closed', 'message', 'ჯავშანი ვერ გაუქმდება');
  end if;

  perform set_config('keke.cancel_reason', why, true);
  update public.bookings
     set status = 'cancelled', cancelled_by = null, cancelled_at = null, updated_at = now()
   where id = b.id;
  if b.parent_booking_id is not null then
    perform public.sync_convoy_master_status(b.parent_booking_id);
  end if;
  perform set_config('keke.cancel_reason', '', true);
  return jsonb_build_object('ok', true, 'code', 'cancelled', 'previous_status', b.status,
    'driver_told', (b.driver_id is not null or b.host_driver_id is not null),
    'message', 'ჯავშანი გაუქმდა');
end;
$$;

revoke all on function public.cancel_booking_by_company(uuid, text) from public, anon;
grant execute on function public.cancel_booking_by_company(uuid, text) to authenticated, service_role;

comment on function public.cancel_booking_by_company(uuid, text) is
  'P0-5: the booking''s company (or an admin) cancels it in one locked step: pending and accepted bookings (and a convoy with no car on the road); never a trip in progress (unless an admin) or a finished one. Outbox, change log and the driver''s notice follow from bookings_after_cancel, the calendar from bookings_after_status_change.';
comment on function public.bookings_after_cancel() is
  'P0-5: on every cancellation — drops waiting second-wave pushes, writes booking_history, and tells the driver and fleet owner once when the company or KEKE cancelled. (The calendar block is removed by bookings_after_status_change.)';

-- P0-6: a booking's company, its convoy and its money are not the apps' to
-- rewrite.
--
-- What was wrong (production, 31 Oct 2026). The UPDATE policy "Enable update
-- for booking owners" checks nothing on the new row (with check (true)), and
-- PostgreSQL ORs the checks of all permissive UPDATE policies, so that one
-- policy switched every other check off. P0-3 (bookings_guard_direct_writes)
-- already keeps a driver to his trip's progress and a company away from the
-- driver statuses, and P0-5 makes cancelled/completed final; what a company
-- could still do to its own rows was:
--   * hang its booking, with itself (or any driver) as the driver, under
--     another company's convoy, and so become a participant of that convoy
--     (its cars, passengers and drivers, and the right to message them);
--   * put a driver KEKE has not approved (or itself) on a booking, or a
--     vehicle that is not the driver's;
--   * rewrite the price and the driver's pay of a finished trip, and the
--     server's own fields (reminders, dispatch, completion, confirmation,
--     the driver's odometer and payment confirmation).
--
-- What changes:
--   1. RLS: the policy with `with check (true)` goes, and so do the two
--      duplicate UPDATE policies for role public ("Companies update own
--      bookings", "Drivers update assigned bookings"). What stays:
--      bookings_update_company (company_id = auth.uid() before and after),
--      bookings_update_assigned_driver (driver_id = auth.uid() before and
--      after) and bookings_admin_update.
--   2. bookings_guard_ownership, before insert or update, for calls from the
--      apps only (role authenticated/anon; the server's functions and jobs,
--      and admins, are not affected), on top of P0-3 and P0-5:
--      - id, company_id and created_at never change;
--      - is_group_master, parent_booking_id, leg_index and group_code are set
--        when the booking is created, and a convoy car can only be created
--        under an open convoy of the same company;
--      - the server's fields are not written by a company, and a new booking
--        starts with them empty (nor can it claim to be an emergency
--        replacement, which the review-debt gate lets through);
--      - a driver is put on a booking (at creation, or while it is pending)
--        only if KEKE approved him and the vehicle named is his approved one;
--        his name, phone and plate and the vehicle go with him, and do not
--        change once the booking is taken;
--      - the money of a completed, cancelled or rejected booking is final,
--        and the driver's pay is set while the booking is still pending.
--
-- Today's apps are not affected: every direct write they make (booking
-- creation with or without a driver, convoy creation, the company's edit and
-- the convoy sync, assigning a driver to a convoy car, the emergency
-- replacement, the pickup-sign file, cancelling, and the driver's start,
-- odometer, completion and payment confirmation) stays within these rules.
--
-- Requires P0-3 part A (driver_can_take_jobs, vehicle_usable_by_driver) and
-- P0-5. Undo: supabase/rollback/20261101150000_booking_ownership_undo.sql.

-- 1. Narrow answers the guard needs (it runs as the caller) -----------------

-- May this driver be put on a booking, with this vehicle (if one is named)?
-- Only companies (who choose drivers anyway) and admins get an answer, so a
-- driver cannot use it to look up other drivers.
create or replace function public.booking_driver_assignable(p_driver_id uuid, p_vehicle_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_driver_id is not null
     and (auth.uid() is null
          or exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('company', 'admin')))
     and public.driver_can_take_jobs(p_driver_id)
     and (p_vehicle_id is null or public.vehicle_usable_by_driver(p_vehicle_id, p_driver_id));
$$;

revoke all on function public.booking_driver_assignable(uuid, uuid) from public, anon;
grant execute on function public.booking_driver_assignable(uuid, uuid) to authenticated, service_role;

-- Is this an open convoy of this company? A signed-in caller can ask only
-- about its own company.
create or replace function public.booking_convoy_open_for(p_master_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (auth.uid() is null or p_company_id = auth.uid())
     and exists (
       select 1
         from public.bookings m
        where m.id = p_master_id
          and m.is_group_master = true
          and m.parent_booking_id is null
          and m.company_id = p_company_id
          and coalesce(m.status, 'pending') not in ('cancelled', 'completed', 'rejected')
     );
$$;

revoke all on function public.booking_convoy_open_for(uuid, uuid) from public, anon;
grant execute on function public.booking_convoy_open_for(uuid, uuid) to authenticated, service_role;

-- 2. The guard --------------------------------------------------------------

create or replace function public.bookings_guard_ownership()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  uid uuid;
  n jsonb;
  o jsonb;
  bad text;
  -- written by the server's functions and jobs, by the driver's trip (P0-3)
  -- or by an admin - never by a company's direct write
  server_columns constant text[] := array[
    'reminder_24h_sent', 'reminder_1h_sent', 'reminder_1h_sent_at',
    'reminder_3h_sent', 'reminder_3h_sent_at', 'reminder_45m_sent', 'reminder_45m_sent_at',
    'driver_confirmed_1h', 'driver_confirmed_at', 'company_unconfirmed_alert_sent',
    'reassign_count', 'auto_reassigned_at', 'completed_at', 'cancelled_by', 'cancelled_at',
    'dispatch_fallback_sent_at', 'dispatch_wave2_due_at', 'dispatch_alert_sent_at',
    'odometer_start_photo_url', 'odometer_start_at', 'odometer_end_photo_url', 'odometer_end_at',
    'payment_status', 'payment_confirmed_at', 'payment_confirmed_by',
    'breakdown_location', 'breakdown_location_type', 'host_driver_id'];
  identity_columns constant text[] := array['id', 'company_id', 'created_at'];
  convoy_columns constant text[] := array['is_group_master', 'parent_booking_id', 'leg_index', 'group_code'];
  driver_columns constant text[] := array[
    'driver_id', 'vehicle_id', 'driver_display_name', 'driver_phone', 'driver_plate', 'is_emergency_replacement'];
  money_columns constant text[] := array[
    'price_gel', 'price_net', 'price_gross', 'client_price', 'commission',
    'driver_payout_gel', 'payment_method', 'price_includes_fuel'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;   -- the server's own functions and jobs
  end if;
  if public.is_admin_user() then
    return new;
  end if;
  uid := auth.uid();
  n := to_jsonb(new);

  if tg_op = 'INSERT' then
    select string_agg(e.key, ', ' order by e.key) into bad
      from jsonb_each(n) e
     where e.key = any (server_columns)
       and e.value not in ('null'::jsonb, 'false'::jsonb)
       and not (e.key = 'reassign_count' and e.value = '0'::jsonb)
       and not (e.key = 'payment_status' and e.value = '"unpaid"'::jsonb);
    if bad is not null then
      raise exception 'bookings: a new booking cannot set % (the server does)', bad using errcode = '42501';
    end if;
    -- (the review-debt gate lets emergency replacements through, so a new
    -- booking cannot simply claim to be one)
    if coalesce(new.is_emergency_replacement, false) then
      raise exception 'bookings: only a replacement on an existing booking is an emergency replacement' using errcode = '42501';
    end if;
    if coalesce(new.is_group_master, false) and new.parent_booking_id is not null then
      raise exception 'bookings: a convoy coordinator cannot be a car of another convoy' using errcode = '42501';
    end if;
    if new.parent_booking_id is not null
       and not public.booking_convoy_open_for(new.parent_booking_id, new.company_id) then
      raise exception 'bookings: a convoy car is added only to an open convoy of the same company' using errcode = '42501';
    end if;
    if new.driver_id is not null then
      if not public.booking_driver_assignable(new.driver_id, new.vehicle_id) then
        raise exception 'bookings: this driver cannot be given jobs (not approved by KEKE, or the vehicle is not his approved one)'
          using errcode = '42501';
      end if;
    elsif new.vehicle_id is not null or new.driver_display_name is not null
       or new.driver_phone is not null or new.driver_plate is not null then
      raise exception 'bookings: driver details come only with a driver' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE. A driver (or a fleet host) is kept to his trip by
  -- bookings_guard_direct_writes; here the booking's company.
  if uid is null or uid is distinct from old.company_id then
    return new;
  end if;
  o := to_jsonb(old);

  select string_agg(c, ', ') into bad from unnest(identity_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    raise exception 'bookings: % of a booking never changes', bad using errcode = '42501';
  end if;

  select string_agg(c, ', ') into bad from unnest(convoy_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    raise exception 'bookings: a convoy is fixed when it is created (%)', bad using errcode = '42501';
  end if;

  select string_agg(c, ', ') into bad from unnest(server_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    raise exception 'bookings: % is written by the server only', bad using errcode = '42501';
  end if;

  if exists (select 1 from unnest(driver_columns) c where n -> c is distinct from o -> c) then
    if old.status is distinct from 'pending' then
      raise exception 'bookings: the driver of a taken booking is changed only by the server' using errcode = '42501';
    end if;
    if new.driver_id is not null then
      if not public.booking_driver_assignable(new.driver_id, new.vehicle_id) then
        raise exception 'bookings: this driver cannot be given jobs (not approved by KEKE, or the vehicle is not his approved one)'
          using errcode = '42501';
      end if;
    elsif new.vehicle_id is not null or new.driver_display_name is not null
       or new.driver_phone is not null or new.driver_plate is not null then
      raise exception 'bookings: driver details come only with a driver' using errcode = '42501';
    end if;
  end if;

  select string_agg(c, ', ') into bad from unnest(money_columns) c where n -> c is distinct from o -> c;
  if bad is not null then
    if old.status in ('completed', 'cancelled', 'rejected') then
      raise exception 'bookings: the money of a % booking is final (%)', old.status, bad using errcode = '42501';
    end if;
    if n -> 'driver_payout_gel' is distinct from o -> 'driver_payout_gel' and old.status is distinct from 'pending' then
      raise exception 'bookings: the driver''s pay is set before a driver takes the job' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.bookings_guard_ownership() from public, anon, authenticated;

-- Fires after bookings_guard_cancellation (P0-5) and bookings_guard_direct_writes
-- (P0-3) and before bookings_stamp_lifecycle (triggers fire by name).
drop trigger if exists bookings_guard_ownership on public.bookings;
create trigger bookings_guard_ownership
  before insert or update on public.bookings
  for each row execute function public.bookings_guard_ownership();

-- 3. RLS: no UPDATE policy may accept any new row ---------------------------

drop policy if exists "Enable update for booking owners" on public.bookings;
drop policy if exists "Companies update own bookings" on public.bookings;
drop policy if exists "Drivers update assigned bookings" on public.bookings;

do $$
begin
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'bookings' and cmd in ('UPDATE', 'ALL')
                and (with_check is null and qual is null or btrim(coalesce(with_check, '')) = 'true')) then
    raise exception 'P0-6: an UPDATE policy on bookings still accepts any new row';
  end if;
end
$$;

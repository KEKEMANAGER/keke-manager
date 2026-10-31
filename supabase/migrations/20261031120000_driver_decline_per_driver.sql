-- P0-1 · A driver's "Decline" on an open booking affects only that driver.
--
-- Before: reject_pending_booking_as_driver set the WHOLE booking to
-- 'rejected' when it had no driver yet (an open job broadcast to many
-- drivers), so one driver's tap removed the job for every driver and the
-- company received a 'rejected' email. The policy
-- bookings_update_driver_reject_open allowed the same by a direct UPDATE.
--
-- After:
--   * open job (driver_id is null): the decline is recorded for that driver
--     only, in booking_driver_declines. The booking stays 'pending' and
--     visible to every other driver; the decliner no longer sees it and can
--     no longer take it (function and direct-update paths). The company or an
--     admin can still assign him on purpose.
--   * job offered to one driver (driver_id = the caller): unchanged — the
--     offer is turned down ('rejected'), and the existing booking email tells
--     the company. The decline is recorded as well.
--   * the direct-UPDATE path to 'rejected' is removed.
--
-- Everything else in the two functions and two policies is the production
-- definition as of 2026-10-31, unchanged. Nothing here touches existing rows.
-- Undo: supabase/rollback/20261031120000_driver_decline_per_driver_undo.sql
-- Tests: supabase/tests/p0_1_driver_decline.test.sql (see supabase/tests/README.md)

-- 1. Who declined which open job --------------------------------------------

create table if not exists public.booking_driver_declines (
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  driver_id   uuid not null references auth.users (id) on delete cascade,
  declined_at timestamptz not null default now(),
  primary key (booking_id, driver_id)
);

comment on table public.booking_driver_declines is
  'One row per driver who declined an open booking. Written only by reject_pending_booking_as_driver; a driver can read only his own rows.';

create index if not exists booking_driver_declines_driver_idx
  on public.booking_driver_declines (driver_id);

alter table public.booking_driver_declines enable row level security;

revoke all on public.booking_driver_declines from public, anon, authenticated;
-- The bookings read rule below looks a driver's own declines up as that
-- driver, so he needs to read them; nobody else's, and no writes.
grant select on public.booking_driver_declines to authenticated;
grant all on public.booking_driver_declines to service_role;

drop policy if exists booking_driver_declines_select_own on public.booking_driver_declines;
create policy booking_driver_declines_select_own on public.booking_driver_declines
  as permissive for select to authenticated
  using (driver_id = (select auth.uid()));

-- 2. Decline: per driver for open jobs --------------------------------------

create or replace function public.reject_pending_booking_as_driver(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  b record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.is_driver_user() then
    raise exception 'driver only' using errcode = '42501';
  end if;

  -- Same row lock as accept_booking_atomic: a decline and an accept of one
  -- booking are applied one after the other, never interleaved.
  select id, status, driver_id, coalesce(is_group_master, false) as is_master
    into b
    from public.bookings
   where id = p_booking_id
   for update;

  if not found or b.status is distinct from 'pending' or b.is_master then
    return false;
  end if;

  -- Open job, offered to every driver: only this driver says no. The booking
  -- is not touched, so the others still see it and can take it.
  if b.driver_id is null then
    insert into public.booking_driver_declines (booking_id, driver_id)
    values (b.id, uid)
    on conflict (booking_id, driver_id) do nothing;
    return true;
  end if;

  -- Offered to this driver alone: his "no" turns the offer down, as before.
  if b.driver_id = uid then
    insert into public.booking_driver_declines (booking_id, driver_id)
    values (b.id, uid)
    on conflict (booking_id, driver_id) do nothing;

    update public.bookings
       set status = 'rejected',
           driver_id = null,
           driver_display_name = null,
           driver_phone = null,
           driver_plate = null,
           updated_at = now()
     where id = b.id;
    return true;
  end if;

  -- Someone else's job.
  return false;
end;
$function$;

revoke all on function public.reject_pending_booking_as_driver(uuid) from public;
grant execute on function public.reject_pending_booking_as_driver(uuid) to authenticated, service_role;

-- 3. Accept: the decliner cannot take the job back --------------------------
--    (production definition; only the P0-1 block is new)

CREATE OR REPLACE FUNCTION public.accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid DEFAULT NULL::uuid, p_display_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_plate text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b record;
  w record;
  v_vehicle uuid;
  caller uuid := auth.uid();
  allowed boolean := false;
  c_booking uuid;
  c_start timestamptz;
  c_end timestamptz;
  which_busy text;
begin
  if p_booking_id is null or p_driver_id is null then
    return jsonb_build_object('ok', false, 'code', 'bad_input',
      'message', 'ჯავშნის ან მძღოლის id არ არის');
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;

  if caller is not null then
    if caller = p_driver_id then
      allowed := true;
    elsif caller = b.company_id then
      allowed := true;
    elsif public.is_admin_user() then
      allowed := true;
    elsif exists (
      select 1 from public.driver_fleet f
       where f.host_driver_id = caller
         and f.sub_driver_id = p_driver_id
         and f.status = 'accepted'
    ) then
      allowed := true;
    end if;
  end if;

  if not allowed then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ამ ჯავშნის აღების უფლება არ გაქვს');
  end if;

  if b.status is distinct from 'pending' then
    if b.driver_id = p_driver_id and b.status in ('accepted', 'in_progress') then
      return jsonb_build_object('ok', true, 'code', 'already_yours',
        'message', 'ჯავშანი უკვე შენზეა');
    end if;
    return jsonb_build_object('ok', false, 'code', 'not_pending',
      'message', 'ჯავშანი უკვე აღებულია ან მიუწვდომელია');
  end if;

  if b.driver_id is not null and b.driver_id <> p_driver_id then
    return jsonb_build_object('ok', false, 'code', 'taken',
      'message', 'ჯავშანი სხვა მძღოლზეა მიბმული');
  end if;

  -- P0-1: a driver who declined this open job cannot take it back, neither
  -- himself nor through his fleet owner. The company or an admin can still
  -- give it to him on purpose.
  if b.driver_id is null
     and caller is distinct from b.company_id
     and not public.is_admin_user()
     and exists (
       select 1 from public.booking_driver_declines d
        where d.booking_id = p_booking_id
          and d.driver_id = p_driver_id
     ) then
    return jsonb_build_object('ok', false, 'code', 'declined',
      'message', 'ეს ჯავშანი უარყავი, ამიტომ მისი აღება აღარ შეგიძლია');
  end if;

  v_vehicle := coalesce(p_vehicle_id, b.vehicle_id);

  select * into w from public.booking_busy_window(p_booking_id);
  if w.win_start is null then
    return jsonb_build_object('ok', false, 'code', 'no_window',
      'message', 'ჯავშნის თარიღი ვერ წაიკითხა');
  end if;

  begin
    insert into public.driver_schedules
      (driver_id, vehicle_id, booking_id, start_time, end_time, source)
    values
      (p_driver_id, v_vehicle, p_booking_id, w.win_start, w.win_end, 'booking');
  exception
    when unique_violation then
      update public.driver_schedules
         set driver_id  = p_driver_id,
             vehicle_id = v_vehicle,
             start_time = w.win_start,
             end_time   = w.win_end
       where booking_id = p_booking_id
         and source = 'booking';
    when exclusion_violation then
      select ds.booking_id,
             ds.start_time,
             ds.end_time,
             case when ds.driver_id = p_driver_id then 'driver' else 'vehicle' end
        into c_booking, c_start, c_end, which_busy
        from public.driver_schedules ds
       where tstzrange(ds.start_time, ds.end_time, '[)')
             && tstzrange(w.win_start, w.win_end, '[)')
         and (ds.driver_id = p_driver_id
              or (v_vehicle is not null and ds.vehicle_id = v_vehicle))
       order by (ds.driver_id = p_driver_id) desc, ds.start_time
       limit 1;

      which_busy := coalesce(which_busy, 'driver');

      return jsonb_build_object(
        'ok', false,
        'code', case when which_busy = 'vehicle' then 'vehicle_busy' else 'driver_busy' end,
        'message', case when which_busy = 'vehicle'
                        then 'ეს მანქანა ამ თარიღებზე უკვე სხვა ჯავშანშია'
                        else 'ამ თარიღებზე უკვე გაქვს სხვა ჯავშანი' end,
        'conflictBookingId', c_booking,
        'conflictStart', c_start,
        'conflictEnd', c_end,
        'windowStart', w.win_start,
        'windowEnd', w.win_end
      );
  end;

  update public.bookings
     set driver_id = p_driver_id,
         status = 'accepted',
         driver_display_name = coalesce(nullif(trim(p_display_name), ''), driver_display_name),
         driver_phone        = coalesce(nullif(trim(p_phone), ''), driver_phone),
         driver_plate        = coalesce(nullif(trim(p_plate), ''), driver_plate),
         vehicle_id          = v_vehicle,
         updated_at          = now()
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'code', 'accepted',
    'windowStart', w.win_start, 'windowEnd', w.win_end);
end;
$function$;

revoke all on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.accept_booking_atomic(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

-- 4. Policies -----------------------------------------------------------------

-- The direct-UPDATE route to 'rejected' goes: declining is only possible
-- through reject_pending_booking_as_driver.
drop policy if exists bookings_update_driver_reject_open on public.bookings;

-- Read rule: as in production, plus "not a job this driver declined" on the
-- open-job branch.
drop policy if exists bookings_select_participants on public.bookings;
create policy bookings_select_participants on public.bookings
  as permissive for select to authenticated
  using (
    (company_id)::text = (auth.uid())::text
    or (driver_id)::text = (auth.uid())::text
    or host_driver_id = auth.uid()
    or (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'driver')
      and status = 'pending'
      and coalesce(is_group_master, false) = false
      and (driver_id is null or trim(both from coalesce((driver_id)::text, '')) = '')
      and not exists (
        select 1 from public.booking_driver_declines d
         where d.booking_id = bookings.id
           and d.driver_id = auth.uid()
      )
    )
    or (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'driver')
      and status = 'pending'
      and coalesce(is_group_master, false) = false
      and (driver_id)::text = (auth.uid())::text
    )
  );

-- Direct accept: as in production, but not of an open job this driver
-- declined. (This route itself is due to go in P0-3.)
drop policy if exists bookings_update_driver_accept on public.bookings;
create policy bookings_update_driver_accept on public.bookings
  as permissive for update to authenticated
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'driver')
    and status = 'pending'
    and (
      (driver_id)::text = (auth.uid())::text
      or (
        (driver_id is null or trim(both from coalesce((driver_id)::text, '')) = '')
        and not exists (
          select 1 from public.booking_driver_declines d
           where d.booking_id = bookings.id
             and d.driver_id = auth.uid()
        )
      )
    )
  )
  with check (
    (driver_id)::text = (auth.uid())::text
    and status = any (array['accepted'::text, 'confirmed'::text])
  );

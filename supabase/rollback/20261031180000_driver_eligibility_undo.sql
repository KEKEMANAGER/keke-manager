-- Undo P0-3 part A: back to the definitions P0-1 and P0-2 left
-- (accept_booking_atomic and the bookings rules as after P0-1; the replacement
-- search, the users guard and the pickup-sign rule as in production on
-- 31 Oct 2026). Undo part B first if it was applied. Changes no rows.

-- 1. Bookings rules, as after P0-1
drop policy if exists "Drivers see assigned bookings" on public.bookings;
create policy "Drivers see assigned bookings" on public.bookings
  as permissive for select to public
  using ((auth.uid() = driver_id));

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

-- 2. The direct-write trigger and the vehicle guard go
drop trigger if exists bookings_guard_direct_writes on public.bookings;
drop function if exists public.bookings_guard_direct_writes();
drop trigger if exists guard_vehicles_verification_columns on public.vehicles;
drop function if exists public.guard_vehicles_verification_columns();

-- 3. accept_booking_atomic as after P0-1
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

-- 4. Replacement search as in production
CREATE OR REPLACE FUNCTION public.find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid)
 RETURNS TABLE(driver_id uuid, full_name text, phone text, vehicle_id uuid, vehicle_plate text, rank_score numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b as (
    select
      bo.id,
      lower(trim(bo.vehicle_type)) as vt,
      lower(trim(bo.vehicle_class)) as vc,
      bo.requested_driver_category,
      bo.required_languages
    from public.bookings bo
    where bo.id = p_booking_id
  ),
  w as (
    select bw.win_start, bw.win_end from public.booking_busy_window(p_booking_id) bw
  ),
  candidates as (
    select
      u.id as did,
      u.full_name as fname,
      u.phone as fphone,
      v.id as vid,
      v.plate as vplate,
      coalesce(u.is_available, false) as is_avail,
      u.available_updated_at as avail_at
    from b
    cross join w
    join public.vehicles v
      on lower(trim(v.type)) = b.vt
     and lower(trim(v.class)) = b.vc
     and coalesce(v.is_active, true) = true
    join public.users u on u.id = v.driver_id
    where b.vt <> '' and b.vc <> ''
      and u.role = 'driver'
      and coalesce(u.is_verified, false) = true
      and coalesce(u.is_blocked, false) = false
      and u.id is distinct from p_exclude_driver_id
      and public.driver_matches_booking_category(
            u.is_guide_driver, u.is_hired_driver, b.requested_driver_category)
      and public.driver_matches_required_languages(u.languages, b.required_languages)
      and not exists (
        select 1 from public.driver_schedules ds
         where ds.driver_id = u.id
           and ds.booking_id is distinct from p_booking_id
           and tstzrange(ds.start_time, ds.end_time, '[)')
               && tstzrange(w.win_start, w.win_end, '[)')
      )
      and not exists (
        select 1 from public.driver_schedules ds2
         where ds2.vehicle_id = v.id
           and ds2.booking_id is distinct from p_booking_id
           and tstzrange(ds2.start_time, ds2.end_time, '[)')
               && tstzrange(w.win_start, w.win_end, '[)')
      )
  )
  select c.did, c.fname, c.fphone, c.vid, c.vplate, s.rank_score
  from candidates c
  join public.driver_rank_scores() s on s.driver_id = c.did
  order by s.rank_score desc,
           c.is_avail desc,
           s.last_dispatched_at asc nulls first,
           c.avail_at desc nulls last,
           c.fname asc nulls last
  limit 1;
$function$;

revoke all on function public.find_replacement_driver_for_booking(uuid, uuid) from public;
grant execute on function public.find_replacement_driver_for_booking(uuid, uuid) to service_role;

-- 5. users guard as in production (line endings aside)
CREATE OR REPLACE FUNCTION public.guard_users_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      RAISE EXCEPTION 'privileged column: cannot set role to admin'
        USING ERRCODE = '42501';
    END IF;
    IF COALESCE(NEW.is_verified, false) THEN
      NEW.is_verified := false;
    END IF;
    -- A row cannot be born approved.
    IF lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('', 'pending', 'submitted') THEN
      NEW.verification_status := 'pending';
    END IF;
    -- Nor certified.
    NEW.keke_certified_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'privileged column: is_verified cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    -- verification_status decides who gets into the app, so only an admin may
    -- write a verdict into it. The owner may still move their own row between
    -- 'pending' and 'submitted', which is what uploading documents does.
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('pending', 'submitted')
    THEN
      RAISE EXCEPTION 'privileged column: verification_status cannot be set to %', NEW.verification_status
        USING ERRCODE = '42501';
    END IF;

    IF NEW.keke_certified_at IS DISTINCT FROM OLD.keke_certified_at THEN
      RAISE EXCEPTION 'privileged column: keke_certified_at cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF OLD.role IS NULL
         AND NEW.role IN ('driver', 'company')
         AND NEW.id = auth.uid()
      THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'privileged column: role cannot be changed'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

revoke all on function public.guard_users_privileged_columns() from public;
grant execute on function public.guard_users_privileged_columns() to service_role;

-- 6. Pickup-sign files: the production read rule
drop policy if exists pickup_signs_select_participants on storage.objects;
drop policy if exists pickup_signs_public_read on storage.objects;
create policy pickup_signs_public_read on storage.objects
  as permissive for select to public
  using ((bucket_id = 'booking-pickup-signs'::text));

-- 7. The new functions go
drop function if exists public.driver_open_jobs(uuid);
drop function if exists public.booking_open_job_summary(public.bookings);
drop function if exists public.booking_summary_pick_each(jsonb, text[]);
drop function if exists public.booking_summary_pick(jsonb, text[]);
drop function if exists public.current_driver_can_take_jobs();
drop function if exists public.driver_can_take_jobs(uuid);
drop function if exists public.vehicle_usable_by_driver(uuid, uuid);
drop function if exists public.driver_account_approved(uuid);

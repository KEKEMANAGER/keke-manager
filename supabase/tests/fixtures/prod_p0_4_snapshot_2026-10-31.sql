-- Read-only snapshot of the PRODUCTION objects behind push notifications and
-- new-booking dispatch that the P0-4 tests need, on top of the lifecycle,
-- reminders and P0-3 snapshots (which already hold booking_notify,
-- fetch_user_push_token, send_expo_push, send_web_push and the profiles /
-- users tables with their grants). Captured on 2026-10-31 from the live
-- catalog of project brrjuxgxmpgvkddcuaad with SELECT queries only. Schema
-- only: no rows, no tokens, no secrets.
--
--   * tables messages, push_outbox, dispatch_log with their rules and grants
--   * the dispatch chain: dispatch_new_booking_push (both overloads),
--     dispatch_due_second_waves, dispatch_missed_new_bookings, log_dispatch
--     and the helpers they call (vehicle_class_rank, city_key,
--     driver_city_key, booking_start_city)
--   * the client-facing notification functions: enqueue_booking_push,
--     create_user_notifications, user_may_notify, may_message_user (and a
--     stand-in for get_support_admin_user_id, which it calls)
--   * flush_push_outbox, and the triggers that touch push tokens
--     (sync_push_token on users, guard_profiles_privileged_columns on profiles)
--
-- Function bodies are as in production with line endings normalised to LF.
-- A TEST FIXTURE, not a migration.
set check_function_bodies = off;

-- ===================================================== functions
-- Stand-in for public.get_support_admin_user_id(), which may_message_user()
-- calls: production picks the support admin from a fixed list of e-mail
-- addresses (supabase/migrations/20260719120000_fix_support_admin_owner.sql);
-- here it is simply the first admin. Same signature and rights.
CREATE OR REPLACE FUNCTION public.get_support_admin_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from public.users where role = 'admin' order by created_at asc, id limit 1;
$function$;
revoke all on function public.get_support_admin_user_id() from public;
grant execute on function public.get_support_admin_user_id() to authenticated;
grant execute on function public.get_support_admin_user_id() to service_role;

CREATE OR REPLACE FUNCTION public.vehicle_class_rank(p_class text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case lower(trim(coalesce(p_class, '')))
           when 'economy' then 1
           when 'comfort' then 2
           when 'business' then 3
           when 'vip' then 4
           else null
         end;
$function$;
revoke all on function public.vehicle_class_rank(text) from public;
grant execute on function public.vehicle_class_rank(text) to public;
grant execute on function public.vehicle_class_rank(text) to anon;
grant execute on function public.vehicle_class_rank(text) to authenticated;
grant execute on function public.vehicle_class_rank(text) to service_role;

CREATE OR REPLACE FUNCTION public.city_key(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select k.city
  from (values
    ('tbilisi','თბილის'), ('tbilisi','tbilisi'), ('tbilisi','tiflis'),
    ('batumi','ბათუმ'), ('batumi','batumi'),
    ('kutaisi','ქუთაის'), ('kutaisi','kutaisi'),
    ('mtskheta','მცხეთ'), ('mtskheta','mtskheta'),
    ('rustavi','რუსთავ'), ('rustavi','rustavi'),
    ('gori','გორი'), ('gori','gori'),
    ('khashuri','ხაშურ'), ('khashuri','khashuri'),
    ('telavi','თელავ'), ('telavi','telavi'),
    ('sighnaghi','სიღნაღ'), ('sighnaghi','sighnaghi'),
    ('kvareli','ყვარელ'), ('kvareli','kvareli'),
    ('zugdidi','ზუგდიდ'), ('zugdidi','zugdidi'),
    ('poti','ფოთი'), ('poti','poti'),
    ('kobuleti','ქობულეთ'), ('kobuleti','kobuleti'),
    ('ozurgeti','ოზურგეთ'), ('ozurgeti','ozurgeti'),
    ('borjomi','ბორჯომ'), ('borjomi','borjomi'),
    ('bakuriani','ბაკურიან'), ('bakuriani','bakuriani'),
    ('akhaltsikhe','ახალციხ'), ('akhaltsikhe','akhaltsikhe'),
    ('gudauri','გუდაურ'), ('gudauri','gudauri'),
    ('kazbegi','ყაზბეგ'), ('kazbegi','kazbegi'),
    ('kazbegi','სტეფანწმინდ'), ('kazbegi','stepantsminda'), ('kazbegi','gergeti'),
    ('mestia','მესტი'), ('mestia','mestia'),
    ('ushguli','უშგულ'), ('ushguli','ushguli'),
    ('lentekhi','ლენტეხ'), ('lentekhi','lentekhi'),
    ('ambrolauri','ამბროლაურ'), ('ambrolauri','ambrolauri'),
    ('zestaponi','ზესტაფონ'), ('zestaponi','zestaponi'),
    ('samtredia','სამტრედი'), ('samtredia','samtredia'),
    ('senaki','სენაკ'), ('senaki','senaki'),
    ('marneuli','მარნეულ'), ('marneuli','marneuli'),
    ('dusheti','დუშეთ'), ('dusheti','dusheti')
  ) as k(city, kw)
  where nullif(btrim(coalesce(p_text, '')), '') is not null
    and position(k.kw in lower(p_text)) > 0
  order by position(k.kw in lower(p_text)) asc, length(k.kw) desc
  limit 1;
$function$;
revoke all on function public.city_key(text) from public;
grant execute on function public.city_key(text) to public;
grant execute on function public.city_key(text) to anon;
grant execute on function public.city_key(text) to authenticated;
grant execute on function public.city_key(text) to service_role;

CREATE OR REPLACE FUNCTION public.driver_city_key(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.city_key(coalesce(nullif(btrim(u.current_city), ''), nullif(btrim(u.city), '')))
  from public.users u
  where u.id = p_user_id;
$function$;
revoke all on function public.driver_city_key(uuid) from public;
grant execute on function public.driver_city_key(uuid) to authenticated;
grant execute on function public.driver_city_key(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.booking_start_city(p_booking_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.city_key(nullif(btrim(b.from_location), '')),
    public.city_key(b.tour_days -> 0 ->> 'fromPlace'),
    public.city_key(b.itinerary -> 0 ->> 'from'),
    public.city_key(b.transfer_in ->> 'airport'),
    public.city_key(b.transfer_in ->> 'hotel'),
    public.city_key(nullif(btrim(b.route::text), '')),
    public.city_key(nullif(btrim(b.to_location), ''))
  )
  from public.bookings b
  where b.id = p_booking_id;
$function$;
revoke all on function public.booking_start_city(uuid) from public;
grant execute on function public.booking_start_city(uuid) to authenticated;
grant execute on function public.booking_start_city(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.log_dispatch(p_booking_id uuid, p_regions text[] DEFAULT '{}'::text[], p_from_location text DEFAULT NULL::text, p_to_location text DEFAULT NULL::text, p_wave1_driver_ids uuid[] DEFAULT '{}'::uuid[], p_wave2_driver_ids uuid[] DEFAULT '{}'::uuid[], p_wave1_token_count integer DEFAULT 0, p_wave2_token_count integer DEFAULT 0, p_wave1_sent integer DEFAULT 0, p_wave1_failed integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company uuid;
  v_allowed boolean := false;
  v_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select b.company_id, (b.company_id = auth.uid() or public.is_admin_user())
    into v_company, v_allowed
  from public.bookings b
  where b.id = p_booking_id;

  if not coalesce(v_allowed, false) then
    return null;
  end if;

  insert into public.dispatch_log (
    booking_id, company_id, regions, from_location, to_location,
    wave1_driver_ids, wave2_driver_ids,
    wave1_token_count, wave2_token_count, wave1_sent, wave1_failed
  )
  values (
    p_booking_id, v_company, coalesce(p_regions, '{}'), p_from_location, p_to_location,
    coalesce(p_wave1_driver_ids, '{}'), coalesce(p_wave2_driver_ids, '{}'),
    coalesce(p_wave1_token_count, 0), coalesce(p_wave2_token_count, 0),
    coalesce(p_wave1_sent, 0), coalesce(p_wave1_failed, 0)
  )
  returning id into v_id;

  return v_id;
end;
$function$;
revoke all on function public.log_dispatch(uuid,text[],text,text,uuid[],uuid[],integer,integer,integer,integer) from public;
grant execute on function public.log_dispatch(uuid,text[],text,text,uuid[],uuid[],integer,integer,integer,integer) to authenticated;
grant execute on function public.log_dispatch(uuid,text[],text,text,uuid[],uuid[],integer,integer,integer,integer) to service_role;

CREATE OR REPLACE FUNCTION public.may_message_user(p_receiver uuid, p_booking_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  support_admin uuid;
  convoy_master uuid;
BEGIN
  IF uid IS NULL OR p_receiver IS NULL OR p_receiver = uid THEN
    RETURN false;
  END IF;
  IF public.is_admin_user() THEN
    RETURN true;
  END IF;

  support_admin := public.get_support_admin_user_id();
  IF support_admin IS NOT NULL AND p_receiver = support_admin THEN
    RETURN true;
  END IF;

  IF p_booking_id IS NOT NULL THEN
    SELECT
      CASE
        WHEN b.is_group_master = true THEN b.id
        WHEN b.parent_booking_id IS NOT NULL THEN b.parent_booking_id
        ELSE NULL
      END
    INTO convoy_master
    FROM public.bookings b
    WHERE b.id = p_booking_id
    LIMIT 1;

    IF convoy_master IS NOT NULL THEN
      RETURN public.may_message_convoy_participant(convoy_master, uid, p_receiver);
    END IF;
  END IF;

  IF p_booking_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.status IN ('accepted', 'confirmed', 'in_progress')
      AND (
        (b.company_id::text = uid::text AND (b.driver_id::text = p_receiver::text OR b.host_driver_id = p_receiver))
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_receiver::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_receiver::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  IF public.has_active_booking_with_user(p_receiver) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_fleet f
    WHERE f.status IN ('pending', 'accepted')
      AND (
        (f.host_driver_id = uid AND f.sub_driver_id = p_receiver)
        OR (f.sub_driver_id = uid AND f.host_driver_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
revoke all on function public.may_message_user(uuid,uuid) from public;
grant execute on function public.may_message_user(uuid,uuid) to authenticated;
grant execute on function public.may_message_user(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
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
    IF COALESCE(NEW.is_verified, false) THEN
      NEW.is_verified := false;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'privileged column: is_verified cannot be changed'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
revoke all on function public.guard_profiles_privileged_columns() from public;
grant execute on function public.guard_profiles_privileged_columns() to service_role;

CREATE OR REPLACE FUNCTION public.sync_push_token_to_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
IF NEW.push_token IS NOT NULL AND NEW.role = 'driver' THEN
UPDATE profiles SET push_token = NEW.push_token WHERE id = NEW.id;
END IF;
RETURN NEW;
END;
$function$;
revoke all on function public.sync_push_token_to_profiles() from public;
grant execute on function public.sync_push_token_to_profiles() to service_role;

CREATE OR REPLACE FUNCTION public.user_may_notify(p_target uuid, p_booking_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  IF p_target = uid THEN
    RETURN true;
  END IF;
  IF public.is_admin_user() THEN
    RETURN true;
  END IF;

  IF p_booking_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.status NOT IN ('cancelled', 'rejected')
      AND (
        (
          b.company_id::text = uid::text
          AND (b.driver_id IS NULL OR b.driver_id::text = p_target::text OR b.host_driver_id = p_target)
        )
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_target::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_target::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_target)
        OR (b.company_id::text = uid::text AND b.host_driver_id = p_target)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status NOT IN ('cancelled', 'rejected')
      AND b.driver_id IS NOT NULL
      AND (
        (b.company_id::text = uid::text AND b.driver_id::text = p_target::text)
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_target::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_target::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_target)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_fleet f
    WHERE (
        (f.host_driver_id = uid AND f.sub_driver_id = p_target)
        OR (f.sub_driver_id = uid AND f.host_driver_id = p_target)
      )
      AND f.status IN ('pending', 'accepted')
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users me
    WHERE me.id = uid AND me.role = 'company'
  ) AND EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = p_target AND t.role = 'driver'
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users me, public.users t
    WHERE me.id = uid
      AND me.role = 'driver'
      AND t.id = p_target
      AND t.role = 'driver'
      AND COALESCE(t.is_hired_driver, false) = true
      AND COALESCE(t.available_for_hire, true) = true
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
revoke all on function public.user_may_notify(uuid,uuid) from public;
grant execute on function public.user_may_notify(uuid,uuid) to authenticated;
grant execute on function public.user_may_notify(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.create_user_notifications(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  item jsonb;
  target uuid;
  bid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    target := NULLIF(item->>'user_id', '')::uuid;
    IF target IS NULL THEN
      CONTINUE;
    END IF;

    bid := NULL;
    IF COALESCE(item->'data'->>'booking_id', '') <> '' THEN
      bid := (item->'data'->>'booking_id')::uuid;
    END IF;

    IF NOT public.user_may_notify(target, bid) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      target,
      COALESCE(item->>'type', 'general'),
      COALESCE(item->>'title', ''),
      COALESCE(item->>'body', ''),
      COALESCE(item->'data', '{}'::jsonb)
    );
  END LOOP;
END;
$function$;
revoke all on function public.create_user_notifications(jsonb) from public;
grant execute on function public.create_user_notifications(jsonb) to authenticated;
grant execute on function public.create_user_notifications(jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.enqueue_booking_push(p_booking_id uuid, p_tokens text[], p_title text, p_body text, p_data jsonb DEFAULT '{}'::jsonb, p_delay_seconds integer DEFAULT 180)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller  uuid := auth.uid();
  b       record;
  n       int  := 0;
  tok     text;
  v_delay int  := least(greatest(coalesce(p_delay_seconds, 180), 0), 3600);
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
      now() + make_interval(secs => v_delay)
    );
    n := n + 1;
  end loop;

  return n;
end;
$function$;
revoke all on function public.enqueue_booking_push(uuid,text[],text,text,jsonb,integer) from public;
grant execute on function public.enqueue_booking_push(uuid,text[],text,text,jsonb,integer) to authenticated;
grant execute on function public.enqueue_booking_push(uuid,text[],text,text,jsonb,integer) to service_role;

CREATE OR REPLACE FUNCTION public.flush_push_outbox(p_limit integer DEFAULT 300)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  delete from public.push_outbox
   where sent_at is not null and sent_at < now() - interval '3 days';

  return sent;
end;
$function$;
revoke all on function public.flush_push_outbox(integer) from public;
grant execute on function public.flush_push_outbox(integer) to service_role;

CREATE OR REPLACE FUNCTION public.dispatch_new_booking_push(p_booking_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_class text;
  v_rank  int;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.status <> 'pending' then
    return 0;
  end if;

  begin
    select bw.win_start, bw.win_end
      into w_start, w_end
      from public.booking_busy_window(p_booking_id) bw;
  exception when others then
    w_start := null;
    w_end   := null;
  end;

  v_class := nullif(trim(coalesce(b.vehicle_class, '')), '');
  v_rank  := public.vehicle_class_rank(v_class);

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
         and (
           v_class is null
           or v.class = v_class
           or (
             v_rank is not null
             and public.vehicle_class_rank(v.class) is not null
             and public.vehicle_class_rank(v.class) >= v_rank
           )
         )
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
    select c.id
      from candidate_ids c
      left join public.users u    on u.id = c.id
      left join public.profiles p on p.id = c.id
     where (b.driver_id is null or c.id = b.driver_id)
       and c.id is distinct from b.company_id
       and (u.is_verified = true or p.is_verified = true)
       and (b.driver_id is not null or coalesce(u.is_hired_driver, false) = false)
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
       and (
         b.required_languages is null
         or array_length(b.required_languages, 1) is null
         or coalesce(u.languages, p.languages, array[]::text[]) && b.required_languages
       )
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
    perform public.booking_notify(d.id, v_title, v_body, 'new_booking', v_data);
    n := n + 1;
  end loop;

  return n;
end;
$function$;
revoke all on function public.dispatch_new_booking_push(uuid) from public;
grant execute on function public.dispatch_new_booking_push(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.dispatch_new_booking_push(p_booking_id uuid, p_wave integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b          record;
  d          record;
  w_start    timestamptz;
  w_end      timestamptz;
  n          int := 0;
  deferred   int := 0;
  pushed     int := 0;
  v_title    text;
  v_body     text;
  v_kind     text;
  v_route    text;
  v_data     jsonb;
  v_class    text;
  v_rank     int;
  v_city     text;
  v_wave     int := case when p_wave = 2 then 2 else 1 end;
  v_local    boolean;
  v_told     uuid[] := '{}';
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found or b.status <> 'pending' then
    return 0;
  end if;

  begin
    select bw.win_start, bw.win_end
      into w_start, w_end
      from public.booking_busy_window(p_booking_id) bw;
  exception when others then
    w_start := null;
    w_end   := null;
  end;

  v_class := nullif(trim(coalesce(b.vehicle_class, '')), '');
  v_rank  := public.vehicle_class_rank(v_class);
  v_city  := public.booking_start_city(p_booking_id);

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
         and (
           v_class is null
           or v.class = v_class
           or (
             v_rank is not null
             and public.vehicle_class_rank(v.class) is not null
             and public.vehicle_class_rank(v.class) >= v_rank
           )
         )
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
           (
             v_city is null
             or public.driver_city_key(c.id) = v_city
             or exists (
               select 1
                 from public.driver_schedules s
                 join public.bookings pb on pb.id = s.booking_id
                where s.driver_id = c.id
                  and w_start is not null
                  and s.end_time <= w_start
                  and s.end_time >= w_start - interval '3 hours'
                  and pb.status in ('accepted', 'in_progress', 'completed')
                  and public.city_key(pb.to_location) = v_city
             )
           ) as is_local,
           public.fetch_user_push_token(c.id) is not null as has_push
      from candidate_ids c
      left join public.users u    on u.id = c.id
      left join public.profiles p on p.id = c.id
     where (b.driver_id is null or c.id = b.driver_id)
       and c.id is distinct from b.company_id
       and (u.is_verified = true or p.is_verified = true)
       and (b.driver_id is not null or coalesce(u.is_hired_driver, false) = false)
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
       and (
         b.required_languages is null
         or array_length(b.required_languages, 1) is null
         or coalesce(u.languages, p.languages, array[]::text[]) && b.required_languages
       )
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
       and not exists (
         select 1
           from public.notifications nx
          where nx.user_id = c.id
            and nx.type = 'new_booking'
            and (nx.data ->> 'booking_id') = b.id::text
       )
  loop
    v_local := d.is_local;
    if v_wave = 1 and not v_local then
      deferred := deferred + 1;
      continue;
    end if;
    perform public.booking_notify(d.id, v_title, v_body, 'new_booking', v_data);
    v_told := v_told || d.id;
    n := n + 1;
    if d.has_push then pushed := pushed + 1; end if;
  end loop;

  -- The admin panel reads this table. Without a row here a dispatch leaves no
  -- trace at all, which is how two bookings reached nobody unnoticed.
  if v_wave = 1 then
    insert into public.dispatch_log (
      booking_id, company_id, regions, from_location, to_location,
      wave1_driver_ids, wave1_token_count, wave1_sent
    ) values (
      b.id, b.company_id, case when v_city is null then '{}'::text[] else array[v_city] end,
      b.from_location, b.to_location, v_told, pushed, n
    );
    update public.bookings
       set dispatch_wave2_due_at = case when deferred > 0 then now() + interval '3 minutes' end
     where id = p_booking_id;
  else
    update public.dispatch_log
       set wave2_driver_ids = v_told, wave2_token_count = pushed
     where booking_id = b.id
       and id = (select id from public.dispatch_log where booking_id = b.id
                 order by created_at desc limit 1);
    update public.bookings set dispatch_wave2_due_at = null where id = p_booking_id;
  end if;

  return n;
end;
$function$;
revoke all on function public.dispatch_new_booking_push(uuid,integer) from public;
grant execute on function public.dispatch_new_booking_push(uuid,integer) to service_role;

CREATE OR REPLACE FUNCTION public.dispatch_due_second_waves()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r     record;
  total int := 0;
begin
  for r in
    select b.id
      from public.bookings b
     where b.status = 'pending'
       and b.driver_id is null
       and b.dispatch_wave2_due_at is not null
       and b.dispatch_wave2_due_at <= now()
     order by b.dispatch_wave2_due_at
     limit 20
  loop
    total := total + public.dispatch_new_booking_push(r.id, 2);
    update public.bookings set dispatch_wave2_due_at = null where id = r.id;
  end loop;
  return total;
end;
$function$;
revoke all on function public.dispatch_due_second_waves() from public;
grant execute on function public.dispatch_due_second_waves() to service_role;

CREATE OR REPLACE FUNCTION public.dispatch_missed_new_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Both arguments, always: adding the wave parameter created an overload
    -- rather than replacing the old function, and a one-argument call then
    -- matched both. Every run failed with "function is not unique" and the
    -- booking that came in during that window reached nobody.
    total := total + public.dispatch_new_booking_push(r.id, 1);
    update public.bookings
       set dispatch_fallback_sent_at = now()
     where id = r.id;
  end loop;

  return total;
end;
$function$;
revoke all on function public.dispatch_missed_new_bookings() from public;
grant execute on function public.dispatch_missed_new_bookings() to service_role;

-- ===================================================== tables
create table public.messages (
  id uuid default gen_random_uuid() not null,
  sender_id uuid not null,
  receiver_id uuid not null,
  booking_id uuid,
  text text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  thread_type text,
  sender_participant_role text,
  receiver_participant_role text
);
alter table public.messages add constraint messages_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
alter table public.messages add constraint messages_pkey PRIMARY KEY (id);
alter table public.messages add constraint messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.messages add constraint messages_text_check CHECK ((char_length(TRIM(BOTH FROM text)) > 0));
alter table public.messages add constraint messages_thread_type_check CHECK (((thread_type IS NULL) OR (thread_type = ANY (ARRAY['company_host'::text, 'company_driver'::text, 'host_driver'::text, 'support'::text, 'convoy'::text]))));
alter table public.messages enable row level security;
create policy messages_admin_all on public.messages as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));
create policy messages_participants_select on public.messages as PERMISSIVE for SELECT to public using (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));
create policy messages_receiver_update on public.messages as PERMISSIVE for UPDATE to public using ((auth.uid() = receiver_id)) with check ((auth.uid() = receiver_id));
create policy messages_sender_insert on public.messages as PERMISSIVE for INSERT to authenticated with check (((auth.uid() = sender_id) AND may_message_user(receiver_id, booking_id)));
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE on public.messages to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE on public.messages to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.messages to service_role;

create table public.push_outbox (
  id uuid default gen_random_uuid() not null,
  booking_id uuid,
  user_id uuid,
  token text not null,
  title text not null,
  body text default ''::text not null,
  data jsonb default '{}'::jsonb not null,
  send_after timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);
alter table public.push_outbox add constraint push_outbox_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.push_outbox add constraint push_outbox_pkey PRIMARY KEY (id);
CREATE INDEX push_outbox_due_idx ON public.push_outbox USING btree (send_after) WHERE (sent_at IS NULL);
alter table public.push_outbox enable row level security;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.push_outbox to service_role;

create table public.dispatch_log (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  booking_id uuid,
  company_id uuid,
  regions text[] default '{}'::text[] not null,
  from_location text,
  to_location text,
  wave1_driver_ids uuid[] default '{}'::uuid[] not null,
  wave2_driver_ids uuid[] default '{}'::uuid[] not null,
  wave1_token_count integer default 0 not null,
  wave2_token_count integer default 0 not null,
  wave1_sent integer default 0 not null,
  wave1_failed integer default 0 not null
);
alter table public.dispatch_log add constraint dispatch_log_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;
alter table public.dispatch_log add constraint dispatch_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES users(id) ON DELETE SET NULL;
alter table public.dispatch_log add constraint dispatch_log_pkey PRIMARY KEY (id);
alter table public.dispatch_log enable row level security;
create policy dispatch_log_admin_select on public.dispatch_log as PERMISSIVE for SELECT to public using (is_admin_user());
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.dispatch_log to anon;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.dispatch_log to authenticated;
grant DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on public.dispatch_log to service_role;

-- ===================================================== triggers
CREATE TRIGGER sync_push_token AFTER INSERT OR UPDATE OF push_token ON public.users FOR EACH ROW EXECUTE FUNCTION sync_push_token_to_profiles();
CREATE TRIGGER guard_profiles_privileged_columns BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profiles_privileged_columns();

reset check_function_bodies;

-- Undo P0-4 part A (20261101090000_push_tokens_server_delivery).
--
-- Puts back the production definitions of enqueue_booking_push,
-- fetch_user_push_token, dispatch_new_booking_push(uuid, integer) and
-- flush_push_outbox, and drops everything part A added. Tokens are not lost:
-- part A never took them out of profiles.push_token, where installed apps
-- keep writing them. Second-wave rows still waiting get their driver's phone
-- again, so the restored flush sends them.
--
-- Undo part B first if it was applied, and P0-5, which tells drivers through
-- part A's deliver_notification (both checked below).

do $$
begin
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.profiles'::regclass and tgname = 'push_tokens_capture') then
    raise exception 'Undo P0-4 part B first: supabase/rollback/20261101090100_push_tokens_private_undo.sql';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_after_cancel') then
    raise exception 'Undo P0-5 first: supabase/rollback/20261101120000_company_cancellation_undo.sql';
  end if;
end
$$;

-- Waiting second-wave rows name a driver; the old flush needs his phone.
do $$
begin
  if to_regclass('public.push_tokens') is not null then
    update public.push_outbox o
       set token = coalesce((select t.token from public.push_tokens t where t.user_id = o.user_id), '')
     where o.sent_at is null and o.user_id is not null and o.token = '';
  end if;
end
$$;

drop index if exists public.push_outbox_booking_user_key;

-- Production definitions
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
revoke all on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, integer) from public, anon;
grant execute on function public.enqueue_booking_push(uuid, text[], text, text, jsonb, integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fetch_user_push_token(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(trim(p.push_token), ''),
    NULLIF(trim(u.push_token), '')
  )
  FROM (SELECT p_user_id AS id) x
  LEFT JOIN public.profiles p ON p.id = x.id
  LEFT JOIN public.users u ON u.id = x.id;
$function$;
revoke all on function public.fetch_user_push_token(uuid) from public, anon, authenticated;
grant execute on function public.fetch_user_push_token(uuid) to service_role;

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
revoke all on function public.dispatch_new_booking_push(uuid, integer) from public, anon, authenticated;
grant execute on function public.dispatch_new_booking_push(uuid, integer) to service_role;

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
revoke all on function public.flush_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.flush_push_outbox(integer) to service_role;

-- What part A added
drop function if exists public.dispatch_new_booking(uuid, uuid[], uuid[]);
drop function if exists public.notify_booking_event(uuid, text, text);
drop function if exists public.notify_chat_message(uuid, uuid);
drop function if exists public.notify_fleet_invite(uuid);
drop function if exists public.notify_profile_viewed(uuid);
drop function if exists public.send_test_push();
drop function if exists public.booking_dispatch_candidates(uuid);
drop function if exists public.booking_dispatch_message(uuid);
drop function if exists public.booking_driver_told(uuid, uuid);
drop function if exists public.deliver_notification(uuid, text, text, text, jsonb, text);
drop function if exists public.is_fleet_host_of(uuid, uuid);
drop trigger if exists push_tokens_mirror on public.profiles;
drop trigger if exists push_tokens_mirror on public.users;
drop function if exists public.push_tokens_mirror();
drop index if exists public.notifications_dedupe_idx;
drop table if exists public.push_tokens;
drop function if exists public.is_expo_push_token(text);

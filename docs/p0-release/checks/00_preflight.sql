-- KEKE P0 release - read-only preflight before P0-1
-- Changes nothing.

begin isolation level repeatable read read only;
-- the database is in the state this step expects
do $state$
begin
  if to_regclass('public.booking_driver_declines') is not null then raise exception 'preflight: P0-1 is already in place - stop'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'auto_reassigned_at') then raise exception 'preflight: P0-2 is already in place - stop'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'driver_can_take_jobs') then raise exception 'preflight: P0-3 A is already in place - stop'; end if;
  if to_regclass('public.push_tokens') is not null then raise exception 'preflight: P0-4 A is already in place - stop'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cancel_booking_by_company') then raise exception 'preflight: P0-5 is already in place - stop'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_guard_ownership' and not tgisinternal) then raise exception 'preflight: P0-6 is already in place - stop'; end if;
end
$state$;
-- pre-P0 production functions: the functions are exactly the rehearsed versions
do $fp$
declare bad text;
begin
  select string_agg(e.fn || coalesce(' (found ' || a.h || ')', ' (missing)'), '; ') into bad
    from (values
    ('accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)', '46150d701a1aeff86b85b31072345fc3'),
    ('dispatch_new_booking_push(p_booking_id uuid)', '4eaad61a3ec3003395ada8c108ba42b4'),
    ('dispatch_new_booking_push(p_booking_id uuid, p_wave integer)', 'f0875f5c94bb6bd64181e510200e64ef'),
    ('enqueue_booking_push(p_booking_id uuid, p_tokens text[], p_title text, p_body text, p_data jsonb, p_delay_seconds integer)', '4cc02c8bb473ad2974a802865eacda00'),
    ('fetch_user_push_token(p_user_id uuid)', '7507893b56c516c572e70852e4891a60'),
    ('find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid)', '90ba14239c0a80f344771b89e12d6bc9'),
    ('flush_push_outbox(p_limit integer)', '4fa89e8bfccee8e78ed80707389f0bf0'),
    ('guard_users_privileged_columns()', '7f7df914e81a199a32f6710f98ff73c4'),
    ('is_admin_user()', '4526bbe5dfc90580cadf624658ac85ab'),
    ('reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)', '10d6da93781693827d7fe3fb35536679'),
    ('reject_pending_booking_as_driver(p_booking_id uuid)', '3d34577eeb69c7b0517a030a5796a613'),
    ('run_booking_reminders()', '108898ec9038d0aa2faac1907ba65eee')
    ) as e(fn, h)
    left join (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
             md5(replace(pg_get_functiondef(p.oid), E'\r', '')) as h
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
    ) a on a.fn = e.fn
   where a.h is distinct from e.h;
  if bad is not null then
    raise exception 'preflight: function not as rehearsed: % - nothing was applied', bad;
  end if;
end
$fp$;
-- pre-P0 production tables: the RLS policies and triggers of bookings are exactly the rehearsed ones
do $tbl$
declare bad text;
begin
  select string_agg(x.t || x.what, '; ') into bad
    from (select e.t, case when (select md5(coalesce(string_agg(pl.policyname || '|' || pl.permissive || '|' || pl.roles::text || '|' || pl.cmd || '|' || coalesce(pl.qual, '') || '|' || coalesce(pl.with_check, ''), E'\n' order by pl.policyname), '')) from pg_policies pl where pl.schemaname = 'public' and pl.tablename = e.t) is distinct from e.pol then ' (policies differ)' else '' end
                   || case when (select md5(coalesce(string_agg(pg_get_triggerdef(tr.oid) || '|' || tr.tgenabled::text, E'\n' order by tr.tgname), '')) from pg_trigger tr where tr.tgrelid = format('public.%I', e.t)::regclass and not tr.tgisinternal) is distinct from e.trg then ' (triggers differ)' else '' end as what
            from (values
    ('bookings', '5911e31c131b2a45174098a68e92e84d', '026a10a5c9a886a6953cbfcee1784515')
            ) as e(t, pol, trg)) x
   where x.what <> '';
  if bad is not null then
    raise exception 'preflight: not as rehearsed: % - nothing was applied', bad;
  end if;
end
$tbl$;
select (select count(*) from public.push_outbox where sent_at is null) as unsent_pushes,
       (select count(*) from (select booking_id, user_id from public.push_outbox where user_id is not null
                              group by 1, 2 having count(*) > 1) d) as push_outbox_duplicates,
       (select count(*) from public.bookings where status = 'in_progress') as trips_in_progress,
       (select count(*) from public.bookings where status in ('accepted', 'pending')
           and date_display ~ '^\d{4}-\d{2}-\d{2}T'
           and date_display::timestamptz between now() - interval '1 hour' and now() + interval '3 hours') as pickups_within_3h,
       (select count(*) from pg_stat_activity where state <> 'idle' and xact_start < now() - interval '1 minute'
           and pid <> pg_backend_pid()) as long_transactions,
       (select count(*) from cron.job where active) as active_cron_jobs;
commit;

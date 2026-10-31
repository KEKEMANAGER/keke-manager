-- KEKE P0 release - read-only check after P0-1
-- Changes nothing.

begin isolation level repeatable read read only;
-- the database is in the state this step expects
do $state$
begin
  if not (to_regclass('public.booking_driver_declines') is not null) then raise exception 'P0-1 check: P0-1 is not in place - stop'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'auto_reassigned_at') then raise exception 'P0-1 check: P0-2 is already in place - stop'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'driver_can_take_jobs') then raise exception 'P0-1 check: P0-3 A is already in place - stop'; end if;
  if to_regclass('public.push_tokens') is not null then raise exception 'P0-1 check: P0-4 A is already in place - stop'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cancel_booking_by_company') then raise exception 'P0-1 check: P0-5 is already in place - stop'; end if;
end
$state$;
-- all P0 functions: the functions are exactly the rehearsed versions
do $fp$
declare bad text;
begin
  select string_agg(e.fn || coalesce(' (found ' || a.h || ')', ' (missing)'), '; ') into bad
    from (values
    ('accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)', '537ccf00483aa684ea00add5330a7e05'),
    ('dispatch_new_booking_push(p_booking_id uuid)', '4eaad61a3ec3003395ada8c108ba42b4'),
    ('dispatch_new_booking_push(p_booking_id uuid, p_wave integer)', 'f0875f5c94bb6bd64181e510200e64ef'),
    ('enqueue_booking_push(p_booking_id uuid, p_tokens text[], p_title text, p_body text, p_data jsonb, p_delay_seconds integer)', '4cc02c8bb473ad2974a802865eacda00'),
    ('fetch_user_push_token(p_user_id uuid)', '7507893b56c516c572e70852e4891a60'),
    ('find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid)', '90ba14239c0a80f344771b89e12d6bc9'),
    ('flush_push_outbox(p_limit integer)', '4fa89e8bfccee8e78ed80707389f0bf0'),
    ('guard_users_privileged_columns()', '7f7df914e81a199a32f6710f98ff73c4'),
    ('reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)', '10d6da93781693827d7fe3fb35536679'),
    ('reject_pending_booking_as_driver(p_booking_id uuid)', '0d29d1940c170ff72cd9619479bb42af'),
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
    raise exception 'P0-1 check: function not as rehearsed: % - nothing was applied', bad;
  end if;
end
$fp$;
select 'P0-1 is in place' as result,
       (select count(*) from supabase_migrations.schema_migrations where version = '20261031120000') as history_row,
       (select count(*) from cron.job where active) as active_cron_jobs;
commit;

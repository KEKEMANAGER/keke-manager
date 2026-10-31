-- KEKE P0 release - read-only check after P0-3 A
-- Changes nothing.

begin isolation level repeatable read read only;
-- the database is in the state this step expects
do $state$
begin
  if not (to_regclass('public.booking_driver_declines') is not null) then raise exception 'P0-3 A check: P0-1 is not in place - stop'; end if;
  if not (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'auto_reassigned_at')) then raise exception 'P0-3 A check: P0-2 is not in place - stop'; end if;
  if not (exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'driver_can_take_jobs')) then raise exception 'P0-3 A check: P0-3 A is not in place - stop'; end if;
  if to_regclass('public.push_tokens') is not null then raise exception 'P0-3 A check: P0-4 A is already in place - stop'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'cancel_booking_by_company') then raise exception 'P0-3 A check: P0-5 is already in place - stop'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_guard_ownership' and not tgisinternal) then raise exception 'P0-3 A check: P0-6 is already in place - stop'; end if;
end
$state$;
-- all P0 functions: the functions are exactly the rehearsed versions
do $fp$
declare bad text;
begin
  select string_agg(e.fn || coalesce(' (found ' || a.h || ')', ' (missing)'), '; ') into bad
    from (values
    ('accept_booking_atomic(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)', 'c9e67b9f63abcb1d958b94cc4de3977d'),
    ('booking_open_job_summary(b bookings)', '70a7fac43f7ab6e59c4549e37d13c4f1'),
    ('booking_summary_pick(p_obj jsonb, p_keys text[])', 'c8a0596643eddd553707bee3dd26a0f6'),
    ('booking_summary_pick_each(p_arr jsonb, p_keys text[])', '8bd95338cc24fe00ac9954b566289229'),
    ('bookings_guard_direct_writes()', '829b8e348eabed5d5c6e8aab96bfd602'),
    ('current_driver_can_take_jobs()', '5641e3a565b3ba7bec88ed5cc06ad369'),
    ('dispatch_new_booking_push(p_booking_id uuid)', '4eaad61a3ec3003395ada8c108ba42b4'),
    ('dispatch_new_booking_push(p_booking_id uuid, p_wave integer)', 'f0875f5c94bb6bd64181e510200e64ef'),
    ('driver_account_approved(p_driver_id uuid)', '03e1a5e2590be3bed4e944f119f80b59'),
    ('driver_can_take_jobs(p_driver_id uuid)', '2fe0926bee278d135ee23f831b154a5d'),
    ('driver_open_jobs(p_booking_id uuid)', 'd685507b8cad5a7a3704b3d9a288ac23'),
    ('enqueue_booking_push(p_booking_id uuid, p_tokens text[], p_title text, p_body text, p_data jsonb, p_delay_seconds integer)', '4cc02c8bb473ad2974a802865eacda00'),
    ('fetch_user_push_token(p_user_id uuid)', '7507893b56c516c572e70852e4891a60'),
    ('find_replacement_driver_for_booking(p_booking_id uuid, p_exclude_driver_id uuid)', 'de485bed187f990de203cac0c79a728e'),
    ('flush_push_outbox(p_limit integer)', '4fa89e8bfccee8e78ed80707389f0bf0'),
    ('guard_users_privileged_columns()', '21e702f118371420f30dc646dc792f79'),
    ('guard_vehicles_verification_columns()', 'c210c5ba8f7a64824c2165f1282d9fd0'),
    ('is_admin_user()', '4526bbe5dfc90580cadf624658ac85ab'),
    ('reassign_booking_to_driver(p_booking_id uuid, p_new_driver_id uuid, p_vehicle_id uuid, p_display_name text, p_phone text, p_plate text)', 'dcff05281b49165e7454b2859d8003d8'),
    ('reject_pending_booking_as_driver(p_booking_id uuid)', '0d29d1940c170ff72cd9619479bb42af'),
    ('run_booking_reminders()', 'f189a9e57470afa7b96b5e4a34a4d16e'),
    ('vehicle_usable_by_driver(p_vehicle_id uuid, p_driver_id uuid)', 'fbfed82d7534286d18a21656ec9e7093')
    ) as e(fn, h)
    left join (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
             md5(replace(pg_get_functiondef(p.oid), E'\r', '')) as h
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
    ) a on a.fn = e.fn
   where a.h is distinct from e.h;
  if bad is not null then
    raise exception 'P0-3 A check: function not as rehearsed: % - nothing was applied', bad;
  end if;
end
$fp$;
select 'P0-3 A is in place' as result,
       (select count(*) from supabase_migrations.schema_migrations where version = '20261031180000') as history_row,
       (select count(*) from cron.job where active) as active_cron_jobs;
commit;

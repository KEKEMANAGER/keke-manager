#!/usr/bin/env bash
# Rehearsal of docs/smart-dispatch-release on a throwaway local PostgreSQL 17 built like production.
set -uo pipefail
export PGHOST=/var/run/postgresql PGPORT=5433 PGUSER=postgres
ROOT=/home/claude/smart; T=$ROOT/supabase/tests; MIG=$ROOT/supabase/migrations; R=$ROOT/docs/smart-dispatch-release
DB=keke_sd_release
q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run() { local o; o=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -v '^$'); if grep -q ERROR <<<"$o"; then grep -m1 ERROR <<<"$o" | cut -c1-220; else tail -${2:-3} <<<"$o"; fi; }
fp() { q <<'SQL'
select 'fn ' || p.oid::regprocedure::text || ' ' || md5(replace(pg_get_functiondef(p.oid), E'\r', '')) || ' ' || coalesce(p.proacl::text, '-')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
union all
select 'col ' || c.table_name || '.' || c.column_name || ' ' || c.data_type || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, '-')
  from information_schema.columns c where c.table_schema = 'public' and c.table_name in ('bookings', 'dispatch_log')
union all
select 'trg ' || pg_get_triggerdef(t.oid) from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal
order by 1;
SQL
}
dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
cd "$T"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null || { echo "base build failed"; exit 1; }
for m in 20261031120000_driver_decline_per_driver 20261031150000_reminder_reassign_once 20261031180000_driver_eligibility \
         20261101090000_push_tokens_server_delivery 20261101120000_company_cancellation 20261101150000_booking_ownership \
         20261102140000_company_profile_fix 20261103130000_vehicle_calendar 20261103170000_fleet_invites_and_one_plate \
         20261103200000_booking_import_approvals 20261104120000_bookings_kind_day_tour; do
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$DB" -f "$MIG/$m.sql" >/dev/null 2>&1 || { echo "migration $m failed"; exit 1; }
done
if [ "$(q -c "select to_regprocedure('public.alert_undispatched_bookings()') is null")" = "t" ]; then
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$DB" -f "$MIG/20261025110000_alert_unaccepted_bookings.sql" >/dev/null 2>&1 || { echo "alert fn failed"; exit 1; }
fi
q -c "revoke all on function public.alert_undispatched_bookings() from public, anon, authenticated;
      grant execute on function public.alert_undispatched_bookings() to service_role;
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text);" >/dev/null
# production's dispatch cron jobs (pg_cron is not here: a table that looks like its catalog)
q -c "create schema if not exists cron;
      create table if not exists cron.job (jobid bigint primary key, jobname text, schedule text, command text, active boolean default true);
      insert into cron.job values (4, 'new-booking-dispatch-fallback', '* * * * *', 'select public.dispatch_missed_new_bookings();', true),
                                  (6, 'dispatch-second-waves', '* * * * *', 'select public.dispatch_due_second_waves();', true),
                                  (7, 'alert-undispatched', '* * * * *', 'select public.alert_undispatched_bookings();', true)
      on conflict do nothing;" >/dev/null
# a little life in the tables the snapshot checks
q -c "insert into public.dispatch_log default values" >/dev/null 2>&1 || true
fp > /tmp/sd_fp_before.txt
echo "== 10 apply";            run "$R/10_apply_smart_dispatch.sql"
echo "== 10 again (must stop)"; run "$R/10_apply_smart_dispatch.sql" 2
echo "  history rows: $(q -c "select count(*) from supabase_migrations.schema_migrations where version = '20261105120000'")"
echo "== 90 smoke";            run "$R/90_smoke_smart_dispatch.sql" 20
echo "  leftovers of the smoke: $(q -c "select count(*) from public.users where email like 'sd-smoke-%'") users, $(q -c "select count(*) from public.bookings where voucher_code = 'SD-SMOKE-1'") bookings"
echo "== 91 undo";             run "$R/91_undo_smart_dispatch.sql"
fp > /tmp/sd_fp_after_undo.txt
if diff -q /tmp/sd_fp_before.txt /tmp/sd_fp_after_undo.txt >/dev/null; then echo "  after undo: SAME as before ($(wc -l < /tmp/sd_fp_before.txt) lines)"; else echo "  after undo: DIFFERENT"; diff /tmp/sd_fp_before.txt /tmp/sd_fp_after_undo.txt | head -10; fi
echo "  history rows: $(q -c "select count(*) from supabase_migrations.schema_migrations where version = '20261105120000'")"
echo "== 91 again (must stop)"; run "$R/91_undo_smart_dispatch.sql" 2
echo "== 10 apply again";      run "$R/10_apply_smart_dispatch.sql"
echo "== 90 smoke again";      run "$R/90_smoke_smart_dispatch.sql" 1

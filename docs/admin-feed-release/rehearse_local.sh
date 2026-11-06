#!/usr/bin/env bash
# Rehearsal of docs/admin-feed-release on a throwaway local PostgreSQL built like
# production today (the snapshots, every migration through the day-tour kind,
# production's admin alert, the migration history table, production's dispatch
# cron jobs, and smart dispatch applied by its own release file). Never connects
# to Supabase; the shim's net.http_post only records.
#   10 apply -> 10 again (must stop) -> 90 smoke -> 91 undo (everything as before)
#   -> 91 again (must stop) -> 10 apply again -> 90 smoke again
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
T=$ROOT/supabase/tests; MIG=$ROOT/supabase/migrations; R=$HERE; SD=$ROOT/docs/smart-dispatch-release
DB="${ADMIN_FEED_REHEARSAL_DB:-keke_af_release}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
run() { local o; o=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -v '^$' | grep -v 'NOTICE'); if grep -q ERROR <<<"$o"; then grep -m1 ERROR <<<"$o" | cut -c1-240; else tail -${2:-3} <<<"$o"; fi; }
fp() { q <<'SQL'
select 'fn ' || p.oid::regprocedure::text || ' ' || md5(replace(pg_get_functiondef(p.oid), E'\r', '')) || ' ' || coalesce(p.proacl::text, '-')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
union all
select 'col ' || c.table_name || '.' || c.column_name || ' ' || c.data_type || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, '-')
  from information_schema.columns c where c.table_schema = 'public' and c.table_name in ('bookings', 'notifications')
union all
select 'trg ' || pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal
union all
select 'row ' || (select count(*) from public.notifications) || ' notices, ' || (select count(*) from public.bookings) || ' bookings, '
       || (select count(*) from supabase_migrations.schema_migrations) || ' history rows'
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
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text);
      create schema if not exists cron;
      create table if not exists cron.job (jobid bigint primary key, jobname text, schedule text, command text, active boolean default true);
      insert into cron.job values (4, 'new-booking-dispatch-fallback', '* * * * *', 'select public.dispatch_missed_new_bookings();', true),
                                  (6, 'dispatch-second-waves', '* * * * *', 'select public.dispatch_due_second_waves();', true),
                                  (7, 'alert-undispatched', '* * * * *', 'select public.alert_undispatched_bookings();', true)
      on conflict do nothing;" >/dev/null
echo "== smart dispatch, as in production: $(run "$SD/10_apply_smart_dispatch.sql" 1)"
# production has one admin, reachable by phone; a little life in the tables
q -c "insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000ad01', 'af-admin@test.invalid');
      insert into public.users (id, role, full_name, email, is_verified, verification_status)
      values ('00000000-0000-4000-8000-00000000ad01', 'admin', 'Test admin', 'af-admin@test.invalid', true, 'approved')
      on conflict (id) do update set role = 'admin';
      insert into public.profiles (id, full_name, push_token) values ('00000000-0000-4000-8000-00000000ad01', 'Test admin', 'ExponentPushToken[af-admin]')
      on conflict (id) do update set push_token = excluded.push_token;
      insert into public.notifications (user_id, title, body, type, is_read, data)
      values ('00000000-0000-4000-8000-00000000ad01', 'old', 'an old notice', 'test', true, '{}');" >/dev/null
fp > /tmp/af_fp_before.txt
echo "== 10 apply";             run "$R/10_apply_admin_feed.sql" 1
echo "== 10 again (must stop)"; run "$R/10_apply_admin_feed.sql" 2
echo "  history rows: $(q -c "select count(*) from supabase_migrations.schema_migrations where version = '20261106150000'")"
echo "== 90 smoke";             run "$R/90_smoke_admin_feed.sql" 12
echo "  leftovers of the smoke: $(q -c "select count(*) from public.users where email like 'af-smoke-%'") users, $(q -c "select count(*) from public.vehicles where plate = 'AFSMOKE-1'") cars, $(q -c "select count(*) from net.http_calls") pushes recorded"
echo "== 91 undo";              run "$R/91_undo_admin_feed.sql" 1
fp > /tmp/af_fp_after_undo.txt
if diff -q /tmp/af_fp_before.txt /tmp/af_fp_after_undo.txt >/dev/null; then echo "  after undo: SAME as before ($(wc -l < /tmp/af_fp_before.txt) lines)"; else echo "  after undo: DIFFERENT"; diff /tmp/af_fp_before.txt /tmp/af_fp_after_undo.txt | head -10; fi
echo "== 91 again (must stop)"; run "$R/91_undo_admin_feed.sql" 2
echo "== 10 apply again";       run "$R/10_apply_admin_feed.sql" 1
echo "== 90 smoke again";       run "$R/90_smoke_admin_feed.sql" 1
echo "== a real booking after the release (the trigger, end to end, locally)"
q -c "insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c001', 'af-co@test.invalid');" \
  -c "insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status)
      values ('00000000-0000-4000-8000-00000000c001', 'company', 'Test company', 'Test Tours', 'af-co@test.invalid', true, 'approved')
      on conflict (id) do update set role = 'company', company_name = 'Test Tours';" \
  -c "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, price_gel, vehicle_type, vehicle_class, passengers, voucher_code)
      values ('00000000-0000-4000-8000-00000000c001', 'transfer', 'pending', '2026-11-06T06:00:00.000Z', 'Tbilisi airport', 'Kazbegi', 150, 'sedan', 'economy', 2, 'AF-LOCAL-1');" >/dev/null \
  || echo "  (the local booking could not be made)"
echo "  the admin's notice: $(q -c "select title || ' | ' || body from public.notifications where type = 'admin_booking_feed' order by created_at desc limit 1")"
echo "  pushed to: $(q -c "select count(*) from net.http_calls where body::text like '%ExponentPushToken[af-admin]%' and body::text like '%AF-LOCAL-1%'") push(es) to the admin's phone"

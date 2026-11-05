#!/usr/bin/env bash
# Smart dispatch (20261105120000_smart_dispatch.sql) on a THROWAWAY local
# PostgreSQL (15+ with pgTAP and btree_gist). It never connects to Supabase;
# nothing is sent anywhere (the shim's net.http_post only records).
#
# The database is production as it is today: built from the snapshots in
# fixtures/ and every migration through the day-tour kind, plus the
# production alert_undispatched_bookings (20261025110000, with the rights the
# security lockdown gave it). Or, with SMART_DISPATCH_TEMPLATE=<db>, a copy of
# a local production-like database (the alert function is added if missing).
#
#   0. production as it is: smart_dispatch_bug_reproduction.sql - 8 BUG
#      checks hold, every SAME check passes;
#   1. the migration (twice: it can be run again): no BUG holds, SAME still
#      passes, smart_dispatch.test.sql passes;
#   2. every earlier suite with it in place (P0-1..P0-6, car calendar, import
#      approvals, day tours) and the concurrency races;
#   3. the undo (twice): every public function, its rights, the columns of
#      bookings and dispatch_log, the triggers and rules of bookings are
#      exactly as before the migration; the 8 BUG checks hold again; the
#      earlier suites pass; then the migration again and its suite again.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIG="$ROOT/supabase/migrations"
MF="$MIG/20261105120000_smart_dispatch.sql"
UF="$ROOT/supabase/rollback/20261105120000_smart_dispatch_undo.sql"
DB="${SMART_DISPATCH_TEST_DB:-keke_smart_dispatch_test}"
TPL="${SMART_DISPATCH_TEMPLATE:-}"
ROUNDS="${SMART_DISPATCH_ROUNDS:-10}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
apply() { local f; for f in "$@"; do psql -X -q -1 -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>"$TMP/apply.err" || { echo "apply failed: $f"; tail -3 "$TMP/apply.err"; exit 1; }; done; }
tap() {
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  local pass fail; pass=$(grep -c '^ok' <<<"$out" || true); fail=$(grep -E '^not ok|ERROR' <<<"$out" | grep -vc '# TODO' || true)
  echo "  $1: $pass ok, $fail failed"
  if [ "$fail" != "0" ]; then grep -E '^not ok|ERROR|#' <<<"$out" | head -30; exit 1; fi
}
held() { # $1 file, $2 expected number of "BUG:" checks still holding (every other check must pass)
  local out n other; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1)
  n=$(grep -E '^ok .* BUG:' <<<"$out" | grep -c . || true)
  other=$(grep -E '^not ok|ERROR' <<<"$out" | grep -v ' BUG:' || true)
  echo "  $1: $n BUG checks holding (expected $2)"
  if [ "$n" != "$2" ] || [ -n "$other" ]; then echo "$other" | head -20; exit 1; fi
}
earlier_suites() {
  tap p0_1_driver_decline.test.sql; tap p0_2_reminder_reassign.test.sql; tap p0_3_driver_eligibility.test.sql
  tap p0_4_push_privacy.test.sql; tap p0_5_company_cancel.test.sql; tap p0_6_booking_ownership.test.sql
  tap vehicle_calendar.test.sql; tap import_approval.test.sql; tap bookings_kind_day_tour.test.sql
  held p0_6_bug_reproduction.sql 0; held p0_5_bug_reproduction.sql 0; held p0_4_bug_reproduction.sql 6
}
fingerprint() { # every public function with its rights, bookings / dispatch_log columns, bookings triggers and rules
  q <<'SQL'
select 'fn ' || p.oid::regprocedure::text || ' ' || md5(replace(pg_get_functiondef(p.oid), E'\r', '')) || ' ' || coalesce(p.proacl::text, '-')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
union all
select 'col ' || c.table_name || '.' || c.column_name || ' ' || c.data_type || ' ' || c.is_nullable || ' ' || coalesce(c.column_default, '-')
       || ' ' || coalesce(col_description(('public.' || c.table_name)::regclass, c.ordinal_position::int), '-')
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name in ('bookings', 'dispatch_log')
union all
select 'trg ' || pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text
  from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal
union all
select 'pol ' || pl.policyname || ' ' || pl.cmd || ' ' || pl.roles::text || ' ' || coalesce(pl.qual, '-') || ' ' || coalesce(pl.with_check, '-')
  from pg_policies pl where pl.schemaname = 'public' and pl.tablename = 'bookings'
order by 1;
SQL
}

dropdb --if-exists "$DB" >/dev/null 2>&1
if [ -n "$TPL" ]; then
  createdb -T "$TPL" "$DB"
  q -c 'create extension if not exists pgtap' >/dev/null 2>&1
else
  createdb "$DB"
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap' \
    -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
    -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
    -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
  apply "$MIG/20261031120000_driver_decline_per_driver.sql" "$MIG/20261031150000_reminder_reassign_once.sql" \
        "$MIG/20261031180000_driver_eligibility.sql" "$MIG/20261101090000_push_tokens_server_delivery.sql" \
        "$MIG/20261101120000_company_cancellation.sql" "$MIG/20261101150000_booking_ownership.sql" \
        "$MIG/20261102140000_company_profile_fix.sql" "$MIG/20261103130000_vehicle_calendar.sql" \
        "$MIG/20261103170000_fleet_invites_and_one_plate.sql" "$MIG/20261103200000_booking_import_approvals.sql" \
        "$MIG/20261104120000_bookings_kind_day_tour.sql"
fi
# production's admin alert (not in the snapshots), with the lockdown's rights
if [ "$(q -c "select to_regprocedure('public.alert_undispatched_bookings()') is null")" = "t" ]; then
  apply "$MIG/20261025110000_alert_unaccepted_bookings.sql"
fi
q -c "revoke all on function public.alert_undispatched_bookings() from public, anon, authenticated;
      grant execute on function public.alert_undispatched_bookings() to service_role;" >/dev/null

echo "0. production as it is"
held smart_dispatch_bug_reproduction.sql 8
fingerprint > "$TMP/before.txt"

echo "1. + smart dispatch (applied twice)"
apply "$MF" "$MF"
held smart_dispatch_bug_reproduction.sql 0
tap smart_dispatch.test.sql

echo "2. every earlier suite with it in place, and the races"
earlier_suites
RACE_TPL="${DB}_race"
dropdb --if-exists "$RACE_TPL" >/dev/null 2>&1; createdb -T "$DB" "$RACE_TPL"
printf 'begin;\n\\ir %s/fixtures/smart_dispatch_seed.sql\ncommit;\n' "$HERE" > "$TMP/seed.sql"
psql -X -q -v ON_ERROR_STOP=1 -d "$RACE_TPL" -f "$TMP/seed.sql" >/dev/null
bash smart_dispatch_concurrency.sh "$RACE_TPL" "$ROUNDS"
dropdb --if-exists "$RACE_TPL" >/dev/null 2>&1

echo "3. undo (twice), and apply again"
apply "$UF" "$UF"
fingerprint > "$TMP/after_undo.txt"
if ! diff -q "$TMP/before.txt" "$TMP/after_undo.txt" >/dev/null; then
  echo "  the undo did not restore production exactly:"; diff "$TMP/before.txt" "$TMP/after_undo.txt" | head -20; exit 1
fi
echo "  every public function (definition and rights), the bookings / dispatch_log columns and the bookings triggers and rules are as before ($(wc -l < "$TMP/before.txt") lines compared)"
held smart_dispatch_bug_reproduction.sql 8
earlier_suites
apply "$MF"
held smart_dispatch_bug_reproduction.sql 0
tap smart_dispatch.test.sql
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
echo "all smart-dispatch checks passed"

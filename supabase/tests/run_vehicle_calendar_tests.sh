#!/usr/bin/env bash
# The host's car calendar (20261103130000_vehicle_calendar) on a THROWAWAY
# local PostgreSQL (15+ with pgTAP and btree_gist): production as of the P0
# release (P0-1 .. P0-6), then the new migration. It never connects to
# Supabase; nothing is sent anywhere (the shim's net.http_post only records).
#
#   1. the new suite: a blocked day keeps the car away from every way a job
#      reaches it, and nobody else's car, driver or calendar changes;
#   2. every P0 suite and reproduction with it in place, as in production;
#   3. undo: its rows are gone, driver_schedules and the two functions are as
#      before, the suites pass; applied again, passes again.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIG="$ROOT/supabase/migrations"
MF="$MIG/20261103130000_vehicle_calendar.sql"
UF="$ROOT/supabase/rollback/20261103130000_vehicle_calendar_undo.sql"
DB="${VEHICLE_CALENDAR_TEST_DB:-keke_vehicle_calendar_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

apply() { local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 | tail -3; exit 1; }; done; }
tap() {
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  local pass fail; pass=$(grep -c '^ok' <<<"$out" || true); fail=$(grep -E '^not ok|ERROR' <<<"$out" | grep -vc '# TODO' || true)
  echo "  $1: $pass ok, $fail failed"
  if [ "$fail" != "0" ]; then grep -E '^not ok|ERROR|#' <<<"$out" | head -30; exit 1; fi
}
held() { # $1 file, $2 expected number of "BUG:" checks still holding
  local n; n=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^ok .* BUG:' | grep -c . || true)
  echo "  $1: $n BUG checks holding (expected $2)"; [ "$n" = "$2" ] || exit 1
}
p0_suites() {
  tap p0_1_driver_decline.test.sql; tap p0_2_reminder_reassign.test.sql; tap p0_3_driver_eligibility.test.sql
  tap p0_4_push_privacy.test.sql; tap p0_5_company_cancel.test.sql; tap p0_6_booking_ownership.test.sql
  held p0_6_bug_reproduction.sql 0; held p0_5_bug_reproduction.sql 0; held p0_4_bug_reproduction.sql 6
}

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
apply "$MIG/20261031120000_driver_decline_per_driver.sql" "$MIG/20261031150000_reminder_reassign_once.sql" \
      "$MIG/20261031180000_driver_eligibility.sql" "$MIG/20261101090000_push_tokens_server_delivery.sql" \
      "$MIG/20261101120000_company_cancellation.sql" "$MIG/20261101150000_booking_ownership.sql"
echo "0. production as it is: every P0 suite"
p0_suites
echo "1. + the car calendar"
apply "$MF"
tap vehicle_calendar.test.sql
echo "2. every P0 suite with it in place"
p0_suites
echo "3. undo, and apply again"
apply "$UF"
if psql -X -qAt -d "$DB" -c "select 1 from pg_proc where proname = 'set_vehicle_day_blocked'" | grep -q 1; then echo "undo left the function"; exit 1; fi
if [ "$(psql -X -qAt -d "$DB" -c "select attnotnull from pg_attribute where attrelid = 'public.driver_schedules'::regclass and attname = 'driver_id'")" != "t" ]; then echo "undo left driver_id nullable"; exit 1; fi
p0_suites
apply "$MF"
tap vehicle_calendar.test.sql
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
echo "all car-calendar checks passed"

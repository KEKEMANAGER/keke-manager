#!/usr/bin/env bash
# Fleet invitations and one plate per driver (20261103170000) on a THROWAWAY
# local PostgreSQL (15+ with pgTAP and btree_gist): production as of 3 Nov 2026
# (P0-1 .. P0-6 and the car calendar), then the new migration. It never
# connects to Supabase; nothing is sent anywhere.
#
#   1. the new suite: invitations only to the host's own car, only the driver
#      accepts or declines, one plate per driver;
#   2. the car calendar and every P0 suite with it in place;
#   3. undo: the functions, guard, policy and index are gone, the suites pass;
#      applied again, passes again.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIG="$ROOT/supabase/migrations"
MF="$MIG/20261103170000_fleet_invites_and_one_plate.sql"
UF="$ROOT/supabase/rollback/20261103170000_fleet_invites_and_one_plate_undo.sql"
DB="${FLEET_TEST_DB:-keke_fleet_invites_test}"
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
suites() {
  tap vehicle_calendar.test.sql
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
      "$MIG/20261101120000_company_cancellation.sql" "$MIG/20261101150000_booking_ownership.sql" \
      "$MIG/20261103130000_vehicle_calendar.sql"
echo "0. production as it is: the calendar and every P0 suite"
suites
echo "1. + fleet invitations and one plate per driver"
apply "$MF"
tap fleet_invites.test.sql
echo "2. everything else with it in place"
suites
echo "3. undo, and apply again"
apply "$UF"
for fn in resolve_driver_for_fleet_invite get_fleet_members_directory driver_fleet_guard; do
  if psql -X -qAt -d "$DB" -c "select 1 from pg_proc where proname = '$fn'" | grep -q 1; then echo "undo left $fn"; exit 1; fi
done
if psql -X -qAt -d "$DB" -c "select 1 from pg_indexes where indexname = 'vehicles_one_plate_per_driver'" | grep -q 1; then echo "undo left the index"; exit 1; fi
suites
apply "$MF"
tap fleet_invites.test.sql
dropdb --if-exists "$DB" >/dev/null 2>&1 || true

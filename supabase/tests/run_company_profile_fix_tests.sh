#!/usr/bin/env bash
# The company-profile-fix check (20261102140000_company_profile_fix) on a
# THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist): production as of
# the P0 release (P0-1 .. P0-6), then the new migration. It never connects to
# Supabase; nothing is sent anywhere.
#
#   1. the new suite: a held company is let back in only by correcting what
#      was asked, and no one else is let in by it;
#   2. the P0-6 and P0-5 suites and their reproductions with it in place;
#   3. undo: the trigger is gone, the suites still pass; applied again, passes again;
#   4. the app side: company_profile_fix_client_check.cjs (no network either).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIG="$ROOT/supabase/migrations"
MF="$MIG/20261102140000_company_profile_fix.sql"
UF="$ROOT/supabase/rollback/20261102140000_company_profile_fix_undo.sql"
DB="${PROFILE_FIX_TEST_DB:-keke_profile_fix_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

apply() { local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; exit 1; }; done; }
tap() {
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  local pass fail; pass=$(grep -c '^ok' <<<"$out" || true); fail=$(grep -Ec '^not ok|ERROR' <<<"$out" || true)
  echo "  $1: $pass ok, $fail failed"
  if [ "$fail" != "0" ]; then grep -E '^not ok|ERROR|#' <<<"$out" | head -20; exit 1; fi
}
bugs() {
  local n; n=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^ok .* BUG:' | grep -c . || true)
  echo "  $1: $n bug(s) present"; [ "$n" = "0" ] || exit 1
}

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
apply "$MIG/20261031120000_driver_decline_per_driver.sql" "$MIG/20261031150000_reminder_reassign_once.sql" \
      "$MIG/20261031180000_driver_eligibility.sql" "$MIG/20261101090000_push_tokens_server_delivery.sql" \
      "$MIG/20261101120000_company_cancellation.sql" "$MIG/20261101150000_booking_ownership.sql"
# the column the request lives in, as the snapshot predates it
echo "1. production (P0-1 .. P0-6) + the profile-fix check"
apply "$MF"
tap company_profile_fix.test.sql
echo "2. everything P0 still holds with it in place"
tap p0_6_booking_ownership.test.sql
tap p0_5_company_cancel.test.sql
bugs p0_6_bug_reproduction.sql
bugs p0_5_bug_reproduction.sql
echo "3. undo, and apply again"
apply "$UF"
if psql -X -qAt -d "$DB" -c "select 1 from pg_trigger where tgname = 'users_profile_fix'" | grep -q 1; then echo "undo left the trigger"; exit 1; fi
tap p0_6_booking_ownership.test.sql
apply "$MF"
tap company_profile_fix.test.sql
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
echo "4. the app side (the form's rule mirrors the server's; texts in 4 languages)"
node "$HERE/company_profile_fix_client_check.cjs" | tail -1
echo "all profile-fix checks passed"

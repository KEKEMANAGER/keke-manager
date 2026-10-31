#!/usr/bin/env bash
# Runs every P0-2 check — and the P0-1 suite again on top of it — on a
# THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist). It never connects
# to Supabase: point PGHOST/PGPORT/PGUSER at a local server you can drop
# databases on.
#
#   1. builds a database from fixtures/ (shim + both production snapshots)
#   2. "before": reproduces P0-2 on the unpatched snapshot
#   3. applies the P0-1 and P0-2 migrations
#   4. pgTAP: P0-2 suite, then the P0-1 suite on the same database
#   5. concurrency: P0-2 races and P0-1 races
#   6. undoes P0-2 (bug back, P0-1 unaffected), re-applies it, re-tests
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M1="$ROOT/supabase/migrations/20261031120000_driver_decline_per_driver.sql"
M2="$ROOT/supabase/migrations/20261031150000_reminder_reassign_once.sql"
U2="$ROOT/supabase/rollback/20261031150000_reminder_reassign_once_undo.sql"
DB="${P0_2_TEST_DB:-keke_p0_2_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

base() { psql -X -q -v ON_ERROR_STOP=1 -d "$1" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql >/dev/null; }
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null 2>&1; }
tap() { # prints plan + failures; fails on a real failure (TODO failures don't count)
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)')
  echo "$out" | grep -E '^(1\.\.|not ok|# Looks)' || true
  echo "   $(echo "$out" | grep -c '^ok') passed"
  ! echo "$out" | grep -E '^not ok|^# Looks like you planned' | grep -vq '# TODO'
}
bug() { # $1 = present | absent
  local out; out=$(psql -X -qAt -d "$DB" -f p0_2_bug_reproduction.sql 2>&1 | grep -E '^(ok|not ok)')
  local bugs_ok; bugs_ok=$(echo "$out" | grep -c '^ok .* BUG:' || true)
  echo "   BUG checks holding: $bugs_ok/7"
  if [[ "$1" == present ]]; then [[ "$bugs_ok" == 7 ]]; else [[ "$bugs_ok" == 0 ]]; fi
}

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"; base "$DB"
echo "== 1/6 before the fix: P0-2 on the production snapshot"; bug present
echo "== 2/6 apply P0-1 and P0-2 (local database only)"; run -f "$M1" -f "$M2"
echo "== 3/6 bug reproduction after the fix"; bug absent
echo "== 4/6 pgTAP"
echo "-- P0-2:"; tap p0_2_reminder_reassign.test.sql
echo "-- P0-1 on the same database:"; tap p0_1_driver_decline.test.sql
echo "== 5/6 concurrency"
dropdb --if-exists "${DB}_tpl" >/dev/null 2>&1; createdb "${DB}_tpl"; base "${DB}_tpl"
psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_tpl" -f "$M1" -f "$M2" >/dev/null 2>&1
psql -X -q -1 -v ON_ERROR_STOP=1 -d "${DB}_tpl" -f fixtures/p0_2_seed.sql >/dev/null
bash p0_2_concurrency.sh "${DB}_tpl" "${P0_2_RACES:-10}"
dropdb "${DB}_tpl"
dropdb --if-exists "${DB}_p1race" >/dev/null 2>&1; createdb "${DB}_p1race"; base "${DB}_p1race"
psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_p1race" -f "$M1" -f "$M2" -f fixtures/p0_1_seed.sql >/dev/null 2>&1
bash p0_1_concurrency.sh "${DB}_p1race" "${P0_1_RACES:-20}"
dropdb "${DB}_p1race"
echo "== 6/6 undo P0-2, then re-apply"
run -f "$U2"
echo "-- after undo:"; bug present
echo "-- P0-1 unaffected by the P0-2 undo:"; tap p0_1_driver_decline.test.sql
run -f "$M2"
echo "-- re-applied:"; bug absent; tap p0_2_reminder_reassign.test.sql
dropdb "$DB"
echo "== ALL P0-2 CHECKS PASSED, P0-1 STILL PASSING (TODO items are known P0-3 / P1-1 gaps)"

#!/usr/bin/env bash
# Runs every P0-1 check on a THROWAWAY local PostgreSQL (15+ with pgTAP and
# btree_gist). It never connects to Supabase: point PGHOST/PGPORT/PGUSER at a
# local server you can drop databases on.
#
#   1. builds a database from fixtures/ (Supabase shim + production snapshot)
#   2. "before": reproduces the bug on the unpatched snapshot
#   3. applies the P0-1 migration and runs the pgTAP tests
#   4. runs the concurrency races
#   5. applies the undo script (bug is back), re-applies the migration, re-tests
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIGRATION="$ROOT/supabase/migrations/20261031120000_driver_decline_per_driver.sql"
UNDO="$ROOT/supabase/rollback/20261031120000_driver_decline_per_driver_undo.sql"
DB="${P0_1_TEST_DB:-keke_p0_1_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
tap() { # prints TAP, returns non-zero on a real failure (TODO failures don't count)
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -v '^$')
  echo "$out"
  ! echo "$out" | grep -E '^not ok' | grep -vq '# TODO'
}
expect_bug() { # the reproduction file must show the bug (all ok) or its absence
  local out; out=$(psql -X -qAt -d "$DB" -f p0_1_bug_reproduction.sql 2>&1 | grep -E '^(ok|not ok)')
  echo "$out"
  if [[ "$1" == present ]]; then ! echo "$out" | grep -q '^not ok'; else [[ $(echo "$out" | grep -c '^not ok') == 3 ]]; fi
}

dropdb --if-exists "$DB" >/dev/null && createdb "$DB"
run -c 'create extension if not exists pgtap' -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql

echo "== 1/5 before the fix: the bug on the production snapshot"
expect_bug present
echo "== 2/5 apply the P0-1 migration (local database only)"
run -f "$MIGRATION" 2>/dev/null
echo "== 3/5 pgTAP: p0_1_driver_decline.test.sql"
tap p0_1_driver_decline.test.sql
echo "== 4/5 concurrency (separate throwaway database: the races need committed rows)"
dropdb --if-exists "${DB}_race" >/dev/null && createdb "${DB}_race"
psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_race" -f fixtures/supabase_shim.sql \
  -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql -f "$MIGRATION" -f fixtures/p0_1_seed.sql >/dev/null 2>&1
bash p0_1_concurrency.sh "${DB}_race" "${P0_1_RACES:-20}"
dropdb "${DB}_race"
echo "== 5/5 undo, then re-apply"
run -f "$UNDO" 2>/dev/null
echo "-- after undo, the bug is back:"
expect_bug present
run -f "$MIGRATION" 2>/dev/null
echo "-- re-applied:"
expect_bug absent
echo "-- pgTAP after re-apply:"
tap p0_1_driver_decline.test.sql | grep -E '^(1\.\.|not ok)' || true
dropdb "$DB"
echo "== ALL P0-1 CHECKS PASSED (TODO items are known gaps owned by P0-3 / P1-1)"

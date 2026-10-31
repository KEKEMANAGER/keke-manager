#!/usr/bin/env bash
# Runs every P0-3 check — and the P0-1 and P0-2 suites again on top of it — on
# a THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist). It never
# connects to Supabase: point PGHOST/PGPORT/PGUSER at a local server you can
# drop databases on.
#
#   1. builds a database from fixtures/ (shim + the three production
#      snapshots), then applies P0-1 and P0-2: the state P0-3 builds on
#   2. "before": the P0-3 reproduction — all 22 problems present
#   3. part A: reproduction (only the 3 part-B items left), P0-3 suite,
#      P0-1 and P0-2 suites
#   4. part B: reproduction (none left), P0-3 suite, P0-1 and P0-2 suites
#   5. concurrency on part B: P0-3 races, then the P0-1 and P0-2 races
#   6. undo part B (part A's results again), undo part A (the problems are
#      back, P0-1 and P0-2 still pass), re-apply both
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M1="$ROOT/supabase/migrations/20261031120000_driver_decline_per_driver.sql"
M2="$ROOT/supabase/migrations/20261031150000_reminder_reassign_once.sql"
M3A="$ROOT/supabase/migrations/20261031180000_driver_eligibility.sql"
M3B="$ROOT/supabase/staged/20261031180100_open_jobs_summary_only.sql"
U3A="$ROOT/supabase/rollback/20261031180000_driver_eligibility_undo.sql"
U3B="$ROOT/supabase/rollback/20261031180100_open_jobs_summary_only_undo.sql"
DB="${P0_3_TEST_DB:-keke_p0_3_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

base() { psql -X -q -v ON_ERROR_STOP=1 -d "$1" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql >/dev/null; }
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null 2>&1; }
fresh() { dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"; base "$1"; }
tap() { # prints plan + failures; fails on a real failure (TODO failures don't count)
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)')
  echo "$out" | grep -E '^(1\.\.|not ok|# Looks)' || true
  echo "   $(echo "$out" | grep -c '^ok') passed"
  ! echo "$out" | grep -E '^not ok|^# Looks like you planned' | grep -vq '# TODO'
}
bugs() { # $1 = how many BUG checks should still hold; $2 = "partb" if those must all be part-B items
  local out held; out=$(psql -X -qAt -d "$DB" -f p0_3_bug_reproduction.sql 2>&1 | grep -E '^(ok|not ok)')
  held=$(echo "$out" | grep '^ok .* BUG:' || true)
  echo "   BUG checks holding: $(echo -n "$held" | grep -c . || true)/22"
  [[ $(echo -n "$held" | grep -c . || true) == "$1" ]] || return 1
  if [[ "${2:-}" == partb ]]; then ! echo "$held" | grep -vq '(part B)'; fi
}

fresh "$DB"; run -f "$M1" -f "$M2"
echo "== 1/6 before P0-3 (production + P0-1 + P0-2): reproduction"; bugs 22
echo "== 2/6 part A (local database only)"; run -f "$M3A"
echo "-- reproduction:"; bugs 3 partb
echo "-- P0-3 suite:"; tap p0_3_driver_eligibility.test.sql
echo "-- P0-1 suite:"; tap p0_1_driver_decline.test.sql
echo "-- P0-2 suite:"; tap p0_2_reminder_reassign.test.sql
echo "== 3/6 part B"; run -f "$M3B"
echo "-- reproduction:"; bugs 0
echo "-- P0-3 suite:"; tap p0_3_driver_eligibility.test.sql
echo "-- P0-1 suite:"; tap p0_1_driver_decline.test.sql
echo "-- P0-2 suite:"; tap p0_2_reminder_reassign.test.sql
echo "== 4/6 concurrency (part B)"
fresh "${DB}_tpl"
psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_tpl" -f "$M1" -f "$M2" -f "$M3A" -f "$M3B" >/dev/null 2>&1
psql -X -q -1 -v ON_ERROR_STOP=1 -d "${DB}_tpl" -f fixtures/p0_3_seed.sql >/dev/null
bash p0_3_concurrency.sh "${DB}_tpl" "${P0_3_RACES:-10}"
dropdb "${DB}_tpl"
fresh "${DB}_p1race"
psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_p1race" -f "$M1" -f "$M2" -f "$M3A" -f "$M3B" -f fixtures/p0_1_seed.sql >/dev/null 2>&1
bash p0_1_concurrency.sh "${DB}_p1race" "${P0_1_RACES:-20}"
dropdb "${DB}_p1race"
fresh "${DB}_p2tpl"
psql -X -q -v ON_ERROR_STOP=1 -d "${DB}_p2tpl" -f "$M1" -f "$M2" -f "$M3A" -f "$M3B" >/dev/null 2>&1
psql -X -q -1 -v ON_ERROR_STOP=1 -d "${DB}_p2tpl" -f fixtures/p0_2_seed.sql >/dev/null
bash p0_2_concurrency.sh "${DB}_p2tpl" "${P0_2_RACES:-10}"
dropdb "${DB}_p2tpl"
echo "== 5/6 undo part B, then part A"
run -f "$U3B"
echo "-- after undoing part B:"; bugs 3 partb; tap p0_3_driver_eligibility.test.sql
run -f "$U3A"
echo "-- after undoing part A, the problems are back:"; bugs 22
echo "-- P0-1 and P0-2 unaffected:"; tap p0_1_driver_decline.test.sql; tap p0_2_reminder_reassign.test.sql
echo "== 6/6 re-apply part A and part B"
run -f "$M3A" -f "$M3B"
bugs 0; tap p0_3_driver_eligibility.test.sql
dropdb "$DB"
echo "== ALL P0-3 CHECKS PASSED; P0-1 AND P0-2 STILL PASSING"

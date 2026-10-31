#!/usr/bin/env bash
# Runs every P0-4 check — and the P0-1, P0-2 and P0-3 suites again on top of
# it — on a THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist). It
# never connects to Supabase, and nothing is sent anywhere: the shim's
# net.http_post only records. Point PGHOST/PGPORT/PGUSER at a local server you
# can drop databases on.
#
#   1. builds a database from fixtures/ (shim + the four production
#      snapshots), then applies P0-1, P0-2 and P0-3 part A: the state P0-4
#      builds on
#   2. "before": the P0-4 reproduction — all 12 problems present — and the
#      double-dispatch race, counted
#   3. part A: reproduction (only the 6 part-B items left), P0-4 suite,
#      P0-1, P0-2 and P0-3 suites
#   4. part B: reproduction (none left), the same suites
#   5. concurrency: the P0-4 races on part A and on part B
#   6. the same with P0-3 part B underneath (both P0-4 parts)
#   7. undo part B (part A's results again), undo part A (the problems are
#      back, P0-1..P0-3 still pass), re-apply both
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M1="$ROOT/supabase/migrations/20261031120000_driver_decline_per_driver.sql"
M2="$ROOT/supabase/migrations/20261031150000_reminder_reassign_once.sql"
M3A="$ROOT/supabase/migrations/20261031180000_driver_eligibility.sql"
M3B="$ROOT/supabase/staged/20261031180100_open_jobs_summary_only.sql"
M4A="$ROOT/supabase/migrations/20261101090000_push_tokens_server_delivery.sql"
M4B="$ROOT/supabase/staged/20261101090100_push_tokens_private.sql"
U4A="$ROOT/supabase/rollback/20261101090000_push_tokens_server_delivery_undo.sql"
U4B="$ROOT/supabase/rollback/20261101090100_push_tokens_private_undo.sql"
DB="${P0_4_TEST_DB:-keke_p0_4_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

base() { psql -X -q -v ON_ERROR_STOP=1 -d "$1" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null; }
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@" >/dev/null 2>&1; }
fresh() { dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"; base "$1"; }
tap() { # prints plan + failures; fails on a real failure (TODO failures don't count)
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  echo "$out" | grep -E '^(1\.\.|not ok|# Looks)|ERROR' || true
  echo "   $(echo "$out" | grep -c '^ok') passed"
  ! echo "$out" | grep -E '^not ok|^# Looks like you planned|ERROR' | grep -vq '# TODO'
}
bugs() { # $1 = how many BUG checks should still hold; $2 = "partb" if those must all be part-B items
  local out held; out=$(psql -X -qAt -d "$DB" -f p0_4_bug_reproduction.sql 2>&1 | grep -E '^(ok|not ok)')
  held=$(echo "$out" | grep '^ok .* BUG:' || true)
  echo "   BUG checks holding: $(echo -n "$held" | grep -c . || true)/12"
  [[ $(echo -n "$held" | grep -c . || true) == "$1" ]] || return 1
  if [[ "${2:-}" == partb ]]; then ! echo "$held" | grep -vq '(part B)'; fi
}
suites() { echo "-- P0-4 suite:"; tap p0_4_push_privacy.test.sql
           echo "-- P0-1 suite:"; tap p0_1_driver_decline.test.sql
           echo "-- P0-2 suite:"; tap p0_2_reminder_reassign.test.sql
           echo "-- P0-3 suite:"; tap p0_3_driver_eligibility.test.sql; }
template() { # $1 name, then migration files: a database with the P0-4 seed committed
  local name=$1; shift
  fresh "$name"
  local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$name" -f "$f" >/dev/null 2>&1; done
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$name" -f fixtures/p0_4_seed.sql >/dev/null
  # the seeded jobs are old news: the one-minute fallback must not pick them up mid-race
  psql -X -q -v ON_ERROR_STOP=1 -d "$name" -c "update public.bookings set created_at = now() - interval '3 hours'" >/dev/null
}

fresh "$DB"; run -f "$M1" -f "$M2" -f "$M3A"
echo "== 1/7 before P0-4 (production + P0-1 + P0-2 + P0-3 part A): reproduction"; bugs 12
template "${DB}_pre" "$M1" "$M2" "$M3A"
echo "-- the double-dispatch race before P0-4 (counted, not checked):"
bash p0_4_concurrency.sh "${DB}_pre" "${P0_4_RACES:-10}" report || true
dropdb "${DB}_pre"
echo "== 2/7 part A (local database only)"; run -f "$M4A"
echo "-- reproduction:"; bugs 6 partb
suites
echo "== 3/7 part B"; run -f "$M4B"
echo "-- reproduction:"; bugs 0
suites
echo "== 4/7 concurrency"
template "${DB}_tplA" "$M1" "$M2" "$M3A" "$M4A"
echo "-- part A:"; bash p0_4_concurrency.sh "${DB}_tplA" "${P0_4_RACES:-10}"
dropdb "${DB}_tplA"
template "${DB}_tplB" "$M1" "$M2" "$M3A" "$M4A" "$M4B"
echo "-- part B:"; bash p0_4_concurrency.sh "${DB}_tplB" "${P0_4_RACES:-10}"
dropdb "${DB}_tplB"
echo "== 5/7 with P0-3 part B underneath"
SAVED="$DB"; DB="${SAVED}_3b"
fresh "$DB"; run -f "$M1" -f "$M2" -f "$M3A" -f "$M3B" -f "$M4A"
echo "-- P0-4 part A:"; bugs 6 partb; suites
run -f "$M4B"
echo "-- P0-4 part B:"; bugs 0; suites
dropdb "$DB"; DB="$SAVED"
echo "== 6/7 undo part B, then part A"
run -f "$U4B"
echo "-- after undoing part B:"; bugs 6 partb; tap p0_4_push_privacy.test.sql
run -f "$U4A"
echo "-- after undoing part A, the problems are back:"; bugs 12
echo "-- P0-1, P0-2 and P0-3 unaffected:"
tap p0_1_driver_decline.test.sql; tap p0_2_reminder_reassign.test.sql; tap p0_3_driver_eligibility.test.sql
echo "== 7/7 re-apply part A and part B"
run -f "$M4A" -f "$M4B"
bugs 0; tap p0_4_push_privacy.test.sql
dropdb "$DB"
echo "== ALL P0-4 CHECKS PASSED; P0-1, P0-2 AND P0-3 STILL PASSING"

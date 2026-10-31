#!/usr/bin/env bash
# Runs every P0-5 check — and the P0-1..P0-4 suites again on top of it — on a
# THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist). It never
# connects to Supabase, and nothing is sent anywhere: the shim's
# net.http_post only records. Point PGHOST/PGPORT/PGUSER at a local server you
# can drop databases on.
#
#   1. builds a database from fixtures/ (shim + the four production
#      snapshots), then applies P0-1, P0-2, P0-3 part A and P0-4 part A: the
#      state P0-5 builds on. The P0-5 reproduction: all 12 problems present.
#   2. P0-5: the reproduction (none left), the P0-5 suite, the P0-4
#      reproduction (only its six part-B items left) and the P0-1..P0-4
#      suites.
#   3. P0-3 part B on top (the rollout's next step), then P0-4 part B — the
#      state after the whole rollout: the same.
#   4. concurrency: the P0-5 races on both states.
#   5. undo: the P0-4 part A undo refuses while P0-5 is in place; undoing
#      P0-5 brings the problems back and leaves P0-1..P0-4 passing; P0-5
#      applied again passes again. On both states.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M1="$ROOT/supabase/migrations/20261031120000_driver_decline_per_driver.sql"
M2="$ROOT/supabase/migrations/20261031150000_reminder_reassign_once.sql"
M3A="$ROOT/supabase/migrations/20261031180000_driver_eligibility.sql"
M3B="$ROOT/supabase/staged/20261031180100_open_jobs_summary_only.sql"
M4A="$ROOT/supabase/migrations/20261101090000_push_tokens_server_delivery.sql"
M4B="$ROOT/supabase/staged/20261101090100_push_tokens_private.sql"
M5="$ROOT/supabase/migrations/20261101120000_company_cancellation.sql"
U4A="$ROOT/supabase/rollback/20261101090000_push_tokens_server_delivery_undo.sql"
U5="$ROOT/supabase/rollback/20261101120000_company_cancellation_undo.sql"
DB="${P0_5_TEST_DB:-keke_p0_5_test}"
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
bugs() { # $1 = how many of the 12 P0-5 BUG checks should still hold
  local out held; out=$(psql -X -qAt -d "$DB" -f p0_5_bug_reproduction.sql 2>&1 | grep -E '^(ok|not ok)')
  held=$(echo "$out" | grep -c '^ok .* BUG:' || true)
  echo "   P0-5 BUG checks holding: $held/12"
  [[ "$held" == "$1" ]]
}
bugs4() { # $1 = how many of the 12 P0-4 BUG checks should still hold (all of them part-B items)
  local out held; out=$(psql -X -qAt -d "$DB" -f p0_4_bug_reproduction.sql 2>&1 | grep -E '^(ok|not ok)')
  held=$(echo "$out" | grep '^ok .* BUG:' || true)
  echo "   P0-4 BUG checks holding: $(echo -n "$held" | grep -c . || true)/12"
  [[ $(echo -n "$held" | grep -c . || true) == "$1" ]] || return 1
  [[ "$1" == 0 ]] || ! echo "$held" | grep -vq '(part B)'
}
suites() { echo "-- P0-5 suite:"; tap p0_5_company_cancel.test.sql
           echo "-- P0-4 suite:"; tap p0_4_push_privacy.test.sql
           echo "-- P0-1 suite:"; tap p0_1_driver_decline.test.sql
           echo "-- P0-2 suite:"; tap p0_2_reminder_reassign.test.sql
           echo "-- P0-3 suite:"; tap p0_3_driver_eligibility.test.sql; }
template() { # $1 name, then migration files: a database with the P0-5 seed committed
  local name=$1; shift
  fresh "$name"
  local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$name" -f "$f" >/dev/null 2>&1; done
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$name" -f fixtures/p0_5_seed.sql >/dev/null
  # E4: a free approved driver with a sedan, the reminder worker's replacement in race 2
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$name" >/dev/null <<'SQL'
insert into auth.users (id, email) values (tests.p5('E4'), 'p05-e4@test.invalid');
insert into public.users (id, role, full_name, email, is_verified, verification_status, is_available)
values (tests.p5('E4'), 'driver', 'Test E4', 'p05-e4@test.invalid', true, 'approved', true);
insert into public.profiles (id, full_name, is_verified, push_token) values (tests.p5('E4'), 'Test E4', true, tests.tok5('E4'));
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
values (tests.p5('vE4'), tests.p5('E4'), 'sedan', 'comfort', 'Test model', 'TEST-vE4', 'approved', true, true);
delete from public.notifications; delete from net.http_calls;
SQL
}

fresh "$DB"; run -f "$M1" -f "$M2" -f "$M3A" -f "$M4A"
echo "== 1/5 before P0-5 (production + P0-1 + P0-2 + P0-3 part A + P0-4 part A): reproduction"; bugs 12
echo "== 2/5 P0-5 (local database only)"; run -f "$M5"
echo "-- reproduction:"; bugs 0
bugs4 6
suites
echo "== 3/5 P0-3 part B on top (the rollout's step after the app update)"
SAVED="$DB"; DB="${SAVED}_mid"
fresh "$DB"; run -f "$M1" -f "$M2" -f "$M3A" -f "$M4A" -f "$M5" -f "$M3B"
echo "-- reproduction:"; bugs 0
echo "-- P0-5 suite:"; tap p0_5_company_cancel.test.sql
dropdb "$DB"
echo "-- and P0-4 part B (after the whole rollout):"
DB="${SAVED}_final"
fresh "$DB"; run -f "$M1" -f "$M2" -f "$M3A" -f "$M4A" -f "$M5" -f "$M3B" -f "$M4B"
echo "-- reproduction:"; bugs 0
bugs4 0
suites
DB="$SAVED"
echo "== 4/5 concurrency"
template "${DB}_tplA" "$M1" "$M2" "$M3A" "$M4A" "$M5"
echo "-- P0-5:"; bash p0_5_concurrency.sh "${DB}_tplA" "${P0_5_RACES:-10}"
dropdb "${DB}_tplA"
template "${DB}_tplB" "$M1" "$M2" "$M3A" "$M4A" "$M5" "$M3B" "$M4B"
echo "-- after the whole rollout:"; bash p0_5_concurrency.sh "${DB}_tplB" "${P0_5_RACES:-10}"
dropdb "${DB}_tplB"
echo "== 5/5 undo"
if psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$U4A" >/dev/null 2>"$DB.undo4.err"; then
  echo "   the P0-4 part A undo ran with P0-5 in place: it should have refused"; exit 1
fi
grep -q 'Undo P0-5 first' "$DB.undo4.err" && echo "   the P0-4 part A undo refuses while P0-5 is in place"; rm -f "$DB.undo4.err"
run -f "$U5"
echo "-- after undoing P0-5, the problems are back:"; bugs 12
echo "-- P0-1..P0-4 unaffected:"
tap p0_4_push_privacy.test.sql; tap p0_1_driver_decline.test.sql; tap p0_2_reminder_reassign.test.sql; tap p0_3_driver_eligibility.test.sql
run -f "$M5"
echo "-- P0-5 applied again:"; bugs 0; tap p0_5_company_cancel.test.sql
SAVED="$DB"; DB="${SAVED}_final"
run -f "$U5"
echo "-- after the whole rollout, undoing P0-5:"; bugs 12
tap p0_4_push_privacy.test.sql; tap p0_1_driver_decline.test.sql; tap p0_2_reminder_reassign.test.sql; tap p0_3_driver_eligibility.test.sql
run -f "$M5"
echo "-- and applying it again:"; bugs 0; tap p0_5_company_cancel.test.sql
dropdb "$DB"; DB="$SAVED"; dropdb "$DB"
echo "== ALL P0-5 CHECKS PASSED; P0-1, P0-2, P0-3 AND P0-4 STILL PASSING"

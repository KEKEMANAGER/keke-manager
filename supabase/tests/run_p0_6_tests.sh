#!/usr/bin/env bash
# Runs every P0-6 check - and the P0-1 .. P0-5 suites and reproductions again
# on top of it - on a THROWAWAY local PostgreSQL (15+ with pgTAP and
# btree_gist). It never connects to Supabase; nothing is sent anywhere (the
# shim's net.http_post only records). Point PGHOST/PGPORT/PGUSER at a local
# server you can drop databases on.
#
#   1. production + P0-1 .. P0-5 (what P0-6 builds on): the P0-6 reproduction,
#      all 12 problems present;
#   2. P0-6: none left; the P0-6 suite; the P0-5 and P0-4 reproductions as
#      before (0, and only P0-4's six part-B items); the P0-1 .. P0-5 suites;
#   3. the whole rollout (P0-1 .. P0-6, then P0-3 part B and P0-4 part B): the
#      same, every reproduction at 0;
#   4. concurrency: the P0-5 races with P0-6 in place, and after the whole rollout;
#   5. undo: undoing P0-6 brings its 12 problems back and leaves P0-1 .. P0-5
#      passing; P0-6 applied again passes again.
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
M6="$ROOT/supabase/migrations/20261101150000_booking_ownership.sql"
U6="$ROOT/supabase/rollback/20261101150000_booking_ownership_undo.sql"
DB="${P0_6_TEST_DB:-keke_p0_6_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

base() { psql -X -q -v ON_ERROR_STOP=1 -d "$1" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null; }
fresh() { dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"; base "$1"; }
apply() { local db=$1; shift; local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; exit 1; }; done; }
tap() { # prints plan problems + failures; fails on a real failure (TODO failures don't count)
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  echo "$out" | grep -E '^(not ok|# Looks)|ERROR' || true
  echo "   $1: $(echo "$out" | grep -c '^ok') passed"
  ! echo "$out" | grep -E '^not ok|^# Looks like you planned|ERROR' | grep -vq '# TODO'
}
held() { # $1 file, $2 expected number of "BUG:" checks still holding
  local n; n=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^ok .* BUG:' | grep -c . || true)
  echo "   $1: $n BUG checks holding (expected $2)"
  [[ "$n" == "$2" ]]
}
suites() { tap p0_5_company_cancel.test.sql; tap p0_4_push_privacy.test.sql; tap p0_1_driver_decline.test.sql
           tap p0_2_reminder_reassign.test.sql; tap p0_3_driver_eligibility.test.sql; }

echo "== 1/5 production + P0-1 .. P0-5: the P0-6 reproduction"
fresh "$DB"; apply "$DB" "$M1" "$M2" "$M3A" "$M4A" "$M5"
held p0_6_bug_reproduction.sql 12

echo "== 2/5 P0-6"
apply "$DB" "$M6"
held p0_6_bug_reproduction.sql 0
tap p0_6_booking_ownership.test.sql
held p0_5_bug_reproduction.sql 0
held p0_4_bug_reproduction.sql 6
suites

echo "== 3/5 the whole rollout: P0-1 .. P0-6, then P0-3 part B and P0-4 part B"
SAVED="$DB"; DB="${SAVED}_final"
fresh "$DB"; apply "$DB" "$M1" "$M2" "$M3A" "$M4A" "$M5" "$M6" "$M3B" "$M4B"
held p0_6_bug_reproduction.sql 0
held p0_5_bug_reproduction.sql 0
held p0_4_bug_reproduction.sql 0
tap p0_6_booking_ownership.test.sql
suites
DB="$SAVED"

echo "== 4/5 concurrency (the P0-5 races)"
tpl() { local name=$1; shift; fresh "$name"; apply "$name" "$@"
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$name" -f fixtures/p0_5_seed.sql >/dev/null
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
tpl "${DB}_tplA" "$M1" "$M2" "$M3A" "$M4A" "$M5" "$M6"
echo "-- with P0-6:"; bash p0_5_concurrency.sh "${DB}_tplA" "${P0_6_RACES:-5}"
dropdb "${DB}_tplA"
tpl "${DB}_tplB" "$M1" "$M2" "$M3A" "$M4A" "$M5" "$M6" "$M3B" "$M4B"
echo "-- after the whole rollout:"; bash p0_5_concurrency.sh "${DB}_tplB" "${P0_6_RACES:-5}"
dropdb "${DB}_tplB"

echo "== 5/5 undo"
apply "$DB" "$U6"
held p0_6_bug_reproduction.sql 12
echo "-- P0-1 .. P0-5 unaffected:"; held p0_5_bug_reproduction.sql 0; suites
apply "$DB" "$M6"
echo "-- P0-6 applied again:"; held p0_6_bug_reproduction.sql 0; tap p0_6_booking_ownership.test.sql
dropdb "$DB"; dropdb "${DB}_final"
echo "== ALL P0-6 CHECKS PASSED; P0-1 .. P0-5 STILL PASSING"

#!/usr/bin/env bash
# The import-approval check (20261102100000_booking_import_approvals) on a
# THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist): production as of
# the P0 release (P0-1 .. P0-6), then the new migration. It never connects to
# Supabase; nothing is sent anywhere. Point PGHOST/PGPORT/PGUSER at a local
# server you can drop databases on.
#
#   1. the new suite: approved imports go in once, anything else is refused,
#      bookings typed into the form are untouched;
#   2. the P0-6 suite and every P0 reproduction again, with the check in place;
#   3. undo: the check is gone, P0-6 still passes; applied again, passes again;
#   4. the P0 release's own tools (docs/p0-release), on a copy built the way
#      their rehearsal builds it: the smoke test passes with the check in
#      place; the P0-6 check and the P0-6 undo notice the two new triggers on
#      bookings and refuse; once the import check is undone they work again.
#      So a rollback undoes this migration first, then P0-6.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M1="$ROOT/supabase/migrations/20261031120000_driver_decline_per_driver.sql"
M2="$ROOT/supabase/migrations/20261031150000_reminder_reassign_once.sql"
M3A="$ROOT/supabase/migrations/20261031180000_driver_eligibility.sql"
M4A="$ROOT/supabase/migrations/20261101090000_push_tokens_server_delivery.sql"
M5="$ROOT/supabase/migrations/20261101120000_company_cancellation.sql"
M6="$ROOT/supabase/migrations/20261101150000_booking_ownership.sql"
MI="$ROOT/supabase/migrations/20261102100000_booking_import_approvals.sql"
UI="$ROOT/supabase/rollback/20261102100000_booking_import_approvals_undo.sql"
DB="${IMPORT_TEST_DB:-keke_import_approval_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

base() { psql -X -q -v ON_ERROR_STOP=1 -d "$1" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null; }
fresh() { dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"; base "$1"; }
apply() { local db=$1; shift; local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; exit 1; }; done; }
tap() { # prints failures; fails on a real failure
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  local pass fail; pass=$(grep -c '^ok' <<<"$out" || true); fail=$(grep -Ec '^not ok|ERROR' <<<"$out" || true)
  echo "  $1: $pass ok, $fail failed"
  if [ "$fail" != "0" ]; then grep -E '^not ok|ERROR|#' <<<"$out" | head -20; exit 1; fi
}
bugs() { # a reproduction: how many BUG checks still fire
  local n; n=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^ok .* BUG:' | grep -c . || true)
  echo "  $1: $n bug(s) present"
  [ "$n" = "0" ] || exit 1
}

echo "1. production (P0-1 .. P0-6) + the import-approval check"
fresh "$DB"; apply "$DB" "$M1" "$M2" "$M3A" "$M4A" "$M5" "$M6" "$MI"
tap import_approval.test.sql
echo "2. everything P0 still holds with the check in place"
tap p0_6_booking_ownership.test.sql
tap p0_5_company_cancel.test.sql
bugs p0_6_bug_reproduction.sql
bugs p0_5_bug_reproduction.sql
echo "3. undo, and apply again"
apply "$DB" "$UI"
tap p0_6_booking_ownership.test.sql
if psql -X -qAt -d "$DB" -c "select 1 from pg_trigger where tgname in ('bookings_verify_import_approval', 'bookings_keep_import_approval')" | grep -q 1; then echo "undo left the trigger"; exit 1; fi
echo "  undo: the check is gone"
apply "$DB" "$MI"
tap import_approval.test.sql
dropdb --if-exists "$DB" >/dev/null 2>&1 || true

echo "4. the P0 release tools with the check in place, and after its undo"
REL="$ROOT/docs/p0-release"
RDB="${DB}_release"
rrun() { psql -X -q -v ON_ERROR_STOP=1 -d "$RDB" "$@" 2>&1; }
refuses() { # $1 file, $2 the reason it must give
  local out; if out=$(rrun -At -f "$1"); then echo "  $(basename "$1") should refuse: it ran"; exit 1; fi
  if [[ "$out" != *"$2"* ]]; then echo "  $(basename "$1") refused for another reason: $(tail -1 <<<"$out")"; exit 1; fi
  echo "  $(basename "$1"): refuses ($2)"
}
says() { # $1 file, $2 what it must print
  local out; out=$(rrun -At -f "$1") || { echo "  $(basename "$1") failed: $(tail -1 <<<"$out")"; exit 1; }
  [[ "$out" == *"$2"* ]] || { echo "  $(basename "$1"): expected '$2'"; exit 1; }
  echo "  $(basename "$1"): $2"
}
fresh "$RDB"
rrun -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[]);
         create schema if not exists cron; create table if not exists cron.job (jobid bigserial primary key, schedule text, command text, active boolean default true, jobname text);
         insert into cron.job (schedule, command, jobname) values ('* * * * *', 'select public.run_booking_reminders()', 'booking-reminders-hourly');" >/dev/null
rrun -1 -f fixtures/p0_5_seed.sql >/dev/null || { echo "seed failed"; exit 1; }
for d in 10_deploy_p0_1 20_deploy_p0_2 30_deploy_p0_3a 40_deploy_p0_4a 50_deploy_p0_5 60_deploy_p0_6; do
  rrun -At -f "$REL/deploy/$d.sql" >/dev/null || { echo "release step failed: $d"; exit 1; }
done
apply "$RDB" "$MI"
out=$(rrun -At -f "$REL/checks/90_smoke_isolated_accounts.sql") || { echo "smoke test failed to run"; exit 1; }
np=$(grep -c '|PASS|' <<<"$out" || true); nf=$(grep -c '|FAIL|' <<<"$out" || true)
echo "  90_smoke_isolated_accounts.sql with the check in place: $np PASS, $nf FAIL"
[[ "$nf" == "0" && "$np" -ge 23 ]] || { grep '|FAIL|' <<<"$out" | head -5; exit 1; }
refuses "$REL/checks/60_check_p0_6.sql" "bookings (triggers differ)"
refuses "$REL/rollback/60_undo_p0_6.sql" "bookings (triggers differ)"
apply "$RDB" "$UI"
says "$REL/checks/60_check_p0_6.sql" "P0-6 is in place"
says "$REL/rollback/60_undo_p0_6.sql" "P0-6 undone"
dropdb --if-exists "$RDB" >/dev/null 2>&1 || true
echo "all import-approval checks passed"

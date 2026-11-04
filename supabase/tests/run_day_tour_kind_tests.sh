#!/usr/bin/env bash
# Day tours stored as day tours (20261104120000_bookings_kind_day_tour.sql), on a
# THROWAWAY local PostgreSQL built like production today (snapshot + every
# migration through the import approvals):
#   1. the bug: the production rule refuses a day tour;
#   2. the fix, and what reads the kind (label, drivers' message, busy time);
#   3. the P0 and import-approval suites still pass with it;
#   4. the undo: puts the old rule back, and refuses while day tours exist.
# Nothing is sent anywhere.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIG="$ROOT/supabase/migrations"
FIX="$MIG/20261104120000_bookings_kind_day_tour.sql"
UNDO="$ROOT/supabase/rollback/20261104120000_bookings_kind_day_tour_undo.sql"
DB="${DAY_TOUR_TEST_DB:-keke_day_tour_kind_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
apply() { local f; for f in "$@"; do psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; exit 1; }; done; }
tap() {
  local out; out=$(psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^(1\.\.|ok|not ok|# Looks)|ERROR')
  local pass fail; pass=$(grep -c '^ok' <<<"$out" || true); fail=$(grep -Ec '^not ok|ERROR' <<<"$out" || true)
  echo "  $1: $pass ok, $fail failed"
  if [ "$fail" != "0" ]; then grep -E '^not ok|ERROR|#' <<<"$out" | head -20; exit 1; fi
}
# a company inserts one booking of this kind, as PostgREST would, then it is
# rolled back; prints "ok" or "refused: <the rule that refused it>"
insert_as_company() {
  local f err
  f=$(mktemp --suffix=.sql)
  cat > "$f" <<SQL
begin;
\\ir $HERE/fixtures/p0_5_seed.sql
select tests.act_as(tests.p5('C1'));
insert into public.bookings (company_id, kind, booking_type, status, date_display, pickup_time, from_location, to_location,
                             passengers, vehicle_type, vehicle_class, price_gel, voucher_code)
values (tests.p5('C1'), '$1', '$1', 'pending', '2026-12-05T05:00:00.000Z', '09:00', 'Tbilisi', 'Kazbegi', 3, 'sedan', 'comfort', 300, '$2');
rollback;
SQL
  err=$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 >/dev/null) && { rm -f "$f"; echo ok; return; }
  rm -f "$f"
  echo "refused: $(grep -o 'bookings_kind_check' <<<"$err" | head -1 || true)"
}
rule() { q -c "select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_kind_check'"; }

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
apply "$MIG/20261031120000_driver_decline_per_driver.sql" "$MIG/20261031150000_reminder_reassign_once.sql" \
      "$MIG/20261031180000_driver_eligibility.sql" "$MIG/20261101090000_push_tokens_server_delivery.sql" \
      "$MIG/20261101120000_company_cancellation.sql" "$MIG/20261101150000_booking_ownership.sql" \
      "$MIG/20261102140000_company_profile_fix.sql" "$MIG/20261103130000_vehicle_calendar.sql" \
      "$MIG/20261103170000_fleet_invites_and_one_plate.sql" "$MIG/20261103200000_booking_import_approvals.sql"

echo "1. production today"
[ "$(insert_as_company day_tour DT-BEFORE)" = "refused: bookings_kind_check" ] || { echo "  expected the day tour to be refused"; exit 1; }
echo "  the rule refuses a day tour: $(rule)"

echo "2. the fix"
apply "$FIX" "$FIX"   # twice: it can be run again
[ "$(insert_as_company day_tour DT-AFTER)" = "ok" ] || { echo "  the day tour is still refused"; exit 1; }
echo "  a company's day tour goes in"
tap bookings_kind_day_tour.test.sql

echo "3. what was there still holds"
tap import_approval.test.sql
tap p0_6_booking_ownership.test.sql
tap p0_5_company_cancel.test.sql

echo "4. the undo"
apply "$UNDO"
[ "$(insert_as_company day_tour DT-UNDONE)" = "refused: bookings_kind_check" ] || { echo "  after the undo a day tour should be refused again"; exit 1; }
echo "  the old rule is back: $(rule)"
apply "$FIX"
[ "$(insert_as_company day_tour DT-KEPT)" = "ok" ] || { echo "  re-applying the fix failed"; exit 1; }
# one day tour stays in the database (as the owner, for a company already there)
q -c "insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000d7001', 'dt-stored@example.test');
      insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
      values ('00000000-0000-4000-8000-0000000d7001', 'company', 'DT stored', 'DT stored tours', 'dt-stored@example.test', true, 'approved', true)
      on conflict (id) do nothing;
      insert into public.bookings (company_id, kind, booking_type, status, date_display, pickup_time, from_location, to_location,
                                   passengers, vehicle_type, vehicle_class, price_gel, voucher_code)
      values ('00000000-0000-4000-8000-0000000d7001', 'day_tour', 'day_tour', 'pending', '2026-12-05T05:00:00.000Z', '09:00',
              'Tbilisi', 'Kazbegi', 3, 'sedan', 'comfort', 300, 'DT-STORED');" >/dev/null
[ "$(q -c "select count(*) from public.bookings where kind = 'day_tour'")" = "1" ] || { echo "  could not store the day tour for the undo check"; exit 1; }
if out=$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -f "$UNDO" 2>&1); then echo "  the undo ran over an existing day tour"; exit 1; fi
[[ "$out" == *"stored as day_tour - nothing changed"* ]] || { echo "  the undo failed for another reason: $(tail -1 <<<"$out")"; exit 1; }
[[ "$(rule)" == *"'day_tour'"* ]] || { echo "  the refused undo changed the rule"; exit 1; }
echo "  with a day tour stored, the undo stops and changes nothing"

dropdb --if-exists "$DB" >/dev/null 2>&1 || true
echo "all day-tour checks passed"

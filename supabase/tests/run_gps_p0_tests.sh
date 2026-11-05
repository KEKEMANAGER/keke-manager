#!/usr/bin/env bash
# Runs every GPS P0 check on a THROWAWAY local PostgreSQL (15+ with pgTAP and
# btree_gist), built like production today: the snapshots, every migration
# production has run (P0-1 .. P0-6, vehicle calendar, fleet invites, import
# approvals, day tour) and the GPS and multi-day tour snapshots of 2026-11-04. It never connects
# to Supabase; nothing is sent anywhere (net.http_post only records). Point
# PGHOST/PGPORT/PGUSER at a local server you can drop databases on; PGUSER
# must be "postgres" (the production snapshot trusts that session user).
#
#   1. production today: all 23 GPS problems are there (6 P0-1, 13 P0-2, 4 P0-3);
#   2. the three migrations one at a time: each removes exactly its own
#      problems; all three can run twice;
#   3. the GPS suite (gps_p0.test.sql);
#   4. everything that was there still holds: the P0-1 .. P0-6, import, day
#      tour, vehicle calendar, fleet invites and company profile suites end
#      exactly as they do on production without the GPS changes (step 1 notes
#      any check that already fails there), and the P0-4 .. P0-6 reproductions
#      are as before;
#   5. with the staged parts on top (P0-3 part B, P0-4 part B): the same;
#   6. races: finishing a trip against its phone's reports;
#   7. undo: each undo alone brings back only its own problems; all three undone
#      leave the GPS objects exactly as production has them (fingerprints of
#      rules, function bodies and execute rights, triggers, jobs, columns,
#      indexes and constraints); the
#      older suites pass in every state; applied again, everything passes.
# As on Supabase, anon and authenticated may execute every new function in
# public unless a migration revokes it; the runner sets that up before the
# GPS snapshot, so a missing revoke shows up in the suite and the fingerprint.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MIG="$ROOT/supabase/migrations"
RB="$ROOT/supabase/rollback"
G1="$MIG/20261104150000_gps_position_only_during_trip.sql"
G2="$MIG/20261104150100_gps_stop_sharing_after_trip.sql"
G3="$MIG/20261104150200_gps_watch_every_trip.sql"
U1="$RB/20261104150000_gps_position_only_during_trip_undo.sql"
U2="$RB/20261104150100_gps_stop_sharing_after_trip_undo.sql"
U3="$RB/20261104150200_gps_watch_every_trip_undo.sql"
DB="${GPS_P0_TEST_DB:-keke_gps_p0_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
cd "$HERE"

build() { # $1 database, then any staged parts to apply before the GPS snapshot
  DB_BUILDING=$1
  dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"
  psql -X -q -v ON_ERROR_STOP=1 -d "$1" -c 'create extension if not exists pgtap' \
    -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
    -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
    -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
  local m
  for m in 20261031120000_driver_decline_per_driver 20261031150000_reminder_reassign_once 20261031180000_driver_eligibility \
           20261101090000_push_tokens_server_delivery 20261101120000_company_cancellation 20261101150000_booking_ownership \
           20261102140000_company_profile_fix 20261103130000_vehicle_calendar 20261103170000_fleet_invites_and_one_plate \
           20261103200000_booking_import_approvals 20261104120000_bookings_kind_day_tour; do
    apply_to "$1" "$MIG/$m.sql"
  done
  shift; [ $# -eq 0 ] || apply_to "$DB_BUILDING" "$@"   # staged parts, if asked for
  # As on Supabase: every new function in public may be run by anon and
  # authenticated unless its migration takes that away.
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB_BUILDING" \
    -c 'alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role' >/dev/null
  apply_to "$DB_BUILDING" fixtures/prod_gps_snapshot_2026-11-04.sql fixtures/prod_tour_days_snapshot_2026-11-04.sql
}
apply_to() { local db=$1; shift; local f; for f in "$@"; do
  psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" >/dev/null 2>&1 || { echo "apply failed: $f"; psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" 2>&1 | tail -3; exit 1; }; done; }
apply() { apply_to "$DB" "$@"; }
tap() { # prints failures; fails on a real failure (TODO failures don't count)
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
gps_held() { # $1 "P0-1 P0-2 P0-3" counts of GPS problems expected to hold
  local out a b c; out=$(psql -X -qAt -d "$DB" -f gps_p0_bug_reproduction.sql 2>&1)
  if echo "$out" | grep -q ERROR; then echo "$out" | grep ERROR | head -3; exit 1; fi
  a=$(grep -cE '^ok [0-9]+ - BUG\(P0-1\)' <<<"$out" || true)
  b=$(grep -cE '^ok [0-9]+ - BUG\(P0-2\)' <<<"$out" || true)
  c=$(grep -cE '^ok [0-9]+ - BUG\(P0-3\)' <<<"$out" || true)
  echo "   GPS problems holding: P0-1 $a, P0-2 $b, P0-3 $c (expected $1)"
  [[ "$a $b $c" == "$1" ]]
}
SUITES="p0_1_driver_decline.test.sql p0_2_reminder_reassign.test.sql p0_3_driver_eligibility.test.sql
        p0_4_push_privacy.test.sql p0_5_company_cancel.test.sql p0_6_booking_ownership.test.sql
        import_approval.test.sql bookings_kind_day_tour.test.sql vehicle_calendar.test.sql
        fleet_invites.test.sql company_profile_fix.test.sql"
declare -A BEFORE
failing() { # the numbers of the checks that fail for a real reason (TODO failures don't count)
  psql -X -qAt -d "$DB" -f "$1" 2>&1 | grep -E '^not ok|ERROR' | grep -v '# TODO' | sed -E 's/^not ok ([0-9]+).*/\1/' | tr '\n' ' ' || true; }
baseline() { # what the older suites do on production as it is, before any GPS change
  local f; for f in $SUITES; do BEFORE[$f]=$(failing "$f"); done
  for f in $SUITES; do [ -z "${BEFORE[$f]}" ] || echo "   note: $f fails checks ${BEFORE[$f]}on production as it is too (not a GPS change)"; done; }
suites() { # every older suite ends exactly as it did before the GPS changes
  local f now pass; for f in $SUITES; do
    now=$(failing "$f"); pass=$(psql -X -qAt -d "$DB" -f "$f" 2>&1 | grep -c '^ok' || true)
    if [ "$now" != "${BEFORE[$f]}" ]; then echo "   $f: failing checks changed: before '${BEFORE[$f]}', now '$now'"; exit 1; fi
    echo "   $f: $pass passed${now:+ (fails $now as before)}"
  done; }
fingerprint() { # the GPS objects: rules, functions, triggers, jobs, columns
  psql -X -qAt -d "$DB" <<'SQL'
select 'policies ' || tablename || ' ' || md5(string_agg(policyname || '|' || permissive || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by policyname))
  from pg_policies where schemaname = 'public' and tablename in ('driver_locations', 'driver_location_trail', 'trip_events', 'locations', 'trip_gps_watch',
                                                                 'booking_day_logs', 'gps_admin_access', 'gps_device_clock', 'gps_skip_counts')
 group by tablename order by 1;
select 'function ' || p.oid::regprocedure::text || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(array_to_string(p.proacl, ','), 'default')
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('watch_trip_gps', 'send_expo_silent_push', 'trip_events_queue_company_email', 'gps_tidy_pins',
                     'gps_trip_accepts_point', 'driver_locations_trip_guard', 'driver_location_trail_keep_trip_points',
                     'driver_locations_server_time', 'driver_locations_device_clock', 'gps_admin_open_access',
                     'gps_admin_close_access', 'gps_fleet_owner_sees', 'gps_road_point_kind', 'gps_road_point_visible',
                     'gps_count_skip', 'gps_backfill_trip_check', 'gps_planned_start', 'gps_tour_days',
                     'bookings_gps_trip_start', 'close_tour_day', 'complete_tour_booking_as_driver', 'tour_day_plan',
                     'tour_day_count') order by 1;
select 'indexes ' || coalesce(string_agg(i.indexrelid::regclass::text || ':' || md5(pg_get_indexdef(i.indexrelid)), ',' order by i.indexrelid::regclass::text), '')
  from pg_index i where i.indrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass,
                                       'public.trip_events'::regclass, 'public.trip_gps_watch'::regclass);
select 'constraints ' || coalesce(string_agg(c.conrelid::regclass::text || '.' || c.conname || ':' || md5(pg_get_constraintdef(c.oid)), ',' order by c.conrelid::regclass::text, c.conname), '')
  from pg_constraint c where c.conrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass,
                                            'public.trip_events'::regclass, 'public.trip_gps_watch'::regclass);
select 'tables ' || coalesce(string_agg(c.relname || ':' || coalesce(array_to_string(c.relacl, ','), 'default'), ' ' order by c.relname), '')
  from pg_class c where c.relnamespace = 'public'::regnamespace
   and c.relname in ('driver_locations', 'driver_location_trail', 'trip_events', 'trip_gps_watch', 'locations',
                     'booking_day_logs', 'gps_device_clock', 'gps_admin_access', 'gps_skip_counts', 'gps_trip_start');
select 'triggers ' || coalesce(string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ',' order by t.tgrelid::regclass::text, t.tgname), '')
  from pg_trigger t where t.tgrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass,
                                        'public.trip_events'::regclass, 'public.trip_gps_watch'::regclass,
                                        'public.bookings'::regclass) and not t.tgisinternal;
select 'jobs ' || string_agg(jobname || ' ' || schedule || ' ' || command, ' | ' order by jobname) from cron.job;
select 'columns ' || table_name || ' ' || string_agg(column_name || ':' || data_type, ',' order by ordinal_position)
  from information_schema.columns where table_schema = 'public'
   and table_name in ('trip_gps_watch', 'driver_locations', 'driver_location_trail', 'trip_events', 'booking_day_logs')
 group by table_name order by table_name;
SQL
}

echo "== 1/7 production today: every GPS problem is there"
build "$DB"
gps_held "6 13 4"
PROD_FP=$(fingerprint)
baseline

echo "== 2/7 the three migrations, one at a time"
apply "$G1"; gps_held "0 13 4"
apply "$G2"; gps_held "0 0 4"
apply "$G3"; gps_held "0 0 0"
apply "$G1" "$G2" "$G3"; echo "   each applied a second time:"; gps_held "0 0 0"

echo "== 3/7 the GPS suite"
tap gps_p0.test.sql

echo "== 4/7 everything that was there still holds"
suites
held p0_6_bug_reproduction.sql 0; held p0_5_bug_reproduction.sql 0; held p0_4_bug_reproduction.sql 6

echo "== 5/7 with the staged parts on top (P0-3 part B, P0-4 part B)"
SAVED="$DB"; DB="${SAVED}_staged"
build "$DB" "$ROOT/supabase/staged/20261031180100_open_jobs_summary_only.sql" "$ROOT/supabase/staged/20261101090100_push_tokens_private.sql"
declare -A MAIN_BEFORE; for f in $SUITES; do MAIN_BEFORE[$f]=${BEFORE[$f]}; done
baseline
gps_held "6 13 4"
apply "$G1" "$G2" "$G3"; gps_held "0 0 0"
tap gps_p0.test.sql; suites
held p0_4_bug_reproduction.sql 0
for f in $SUITES; do BEFORE[$f]=${MAIN_BEFORE[$f]}; done
dropdb "$DB"; DB="$SAVED"

echo "== 6/7 races"
TPL="${SAVED}_race"
build "$TPL"; apply_to "$TPL" "$G1" "$G2" "$G3"
psql -X -q -1 -v ON_ERROR_STOP=1 -d "$TPL" -f fixtures/gps_p0_seed.sql >/dev/null
bash gps_p0_concurrency.sh "$TPL" "${GPS_P0_RACES:-10}"
dropdb "$TPL"

echo "== 7/7 undo"
echo "-- each undo alone brings back only its own problems:"
apply "$U1"; gps_held "6 0 0"; apply "$G1"
apply "$U2"; gps_held "0 13 0"; apply "$G2"
apply "$U3"; gps_held "0 0 4"; apply "$G3"
gps_held "0 0 0"
echo "-- all three undone, newest first:"
apply "$U3" "$U2" "$U1"
gps_held "6 13 4"
if [ "$(fingerprint)" != "$PROD_FP" ]; then
  echo "   the GPS objects differ from production after the undo:"; diff <(echo "$PROD_FP") <(fingerprint) || true; exit 1
fi
echo "   the GPS objects are exactly as production has them (rules, functions and execute rights, triggers, jobs, columns, indexes, constraints, tables and their rights)"
suites
echo "-- applied again:"
apply "$G1" "$G2" "$G3"; gps_held "0 0 0"; tap gps_p0.test.sql
dropdb "$DB"
echo "== ALL GPS P0 CHECKS PASSED; EVERYTHING BEFORE STILL PASSING"

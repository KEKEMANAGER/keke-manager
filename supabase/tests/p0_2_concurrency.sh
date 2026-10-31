#!/usr/bin/env bash
# P0-2 concurrency checks with real simultaneous sessions, on THROWAWAY local
# databases copied from a template that already has the shim, both production
# snapshots, the migrations and the committed P0-2 seed (run_p0_2_tests.sh
# builds it).
#
#   race 1  two reminder runs at the same moment (cron overlap, manual call)
#   race 2  the reminder run vs. driver A confirming at the same moment
#
# Usage: p0_2_concurrency.sh <template database> [rounds]
set -euo pipefail
TPL="${1:?template database}"
N="${2:-10}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
session() { # $1 db, $2 sql (one value), $3 out file
  psql -X -qAt -d "$1" -c "begin; $2; select pg_sleep(1); commit;" 2>"$3.err" | grep -v '^$' | tail -1 > "$3" || true
}
fail=0; ok1=0; ok2=0; confirmed_first=0; swapped_first=0

for i in $(seq 1 "$N"); do
  # race 1 — two runs at once
  db="p02_race_${i}"
  dropdb --if-exists "$db" >/dev/null 2>&1; createdb -T "$TPL" "$db"
  session "$db" "select public.run_booking_reminders()::text" "$TMP/a" &
  session "$db" "select public.run_booking_reminders()::text" "$TMP/b" &
  wait
  skipped=$(cat "$TMP/a" "$TMP/b" | grep -c '"skipped"' || true)
  state=$(q "$db" "select (select reassign_count from public.bookings where id = tests.r_id('R45')) || ',' ||
                          (select count(*) from public.notifications where type = 'booking_auto_reassigned' and data ->> 'bookingId' = tests.r_id('R45')::text) || ',' ||
                          (select count(*) from public.driver_schedules where booking_id = tests.r_id('R45')) || ',' ||
                          (select reassign_count from public.bookings where id = tests.r_id('RESC')) || ',' ||
                          (select count(*) from public.notifications where type = 'booking_driver_unconfirmed' and data ->> 'bookingId' = tests.r_id('RNONE')::text)")
  if [[ "$skipped" == 1 && "$state" == "1,1,1,1,1" ]]; then ok1=$((ok1+1)); else fail=1; echo "race 1 #$i FAILED: skipped=$skipped state=$state $(cat "$TMP"/*.err)"; fi
  dropdb "$db"

  # race 2 — the run vs. driver A confirming R45
  db="p02_race_c${i}"
  dropdb --if-exists "$db" >/dev/null 2>&1; createdb -T "$TPL" "$db"
  if (( i % 2 )); then
    session "$db" "select tests.act_as(tests.r_id('A')); select public.confirm_booking_as_driver(tests.r_id('R45')) ->> 'code'" "$TMP/c" &
    sleep 0.1; session "$db" "select public.run_booking_reminders()::text" "$TMP/d" &
  else
    session "$db" "select public.run_booking_reminders()::text" "$TMP/d" &
    sleep 0.1; session "$db" "select tests.act_as(tests.r_id('A')); select public.confirm_booking_as_driver(tests.r_id('R45')) ->> 'code'" "$TMP/c" &
  fi
  wait
  code=$(cat "$TMP/c")
  state=$(q "$db" "select (driver_id = tests.r_id('A')) || ',' || coalesce(driver_confirmed_1h::text, 'null') || ',' || reassign_count || ',' ||
                          (select count(*) from public.notifications where type = 'booking_taken_away' and data ->> 'bookingId' = tests.r_id('R45')::text)
                     from public.bookings where id = tests.r_id('R45')")
  # consistent outcomes only: A confirmed and kept the job, or A was replaced and his late confirm was refused
  if [[ "$code" == confirmed && "$state" == "true,true,0,0" ]]; then ok2=$((ok2+1)); confirmed_first=$((confirmed_first+1));
  elif [[ "$code" == forbidden && "$state" == "false,null,1,1" ]]; then ok2=$((ok2+1)); swapped_first=$((swapped_first+1));
  else fail=1; echo "race 2 #$i FAILED: confirm=$code state=$state $(cat "$TMP"/*.err)"; fi
  dropdb "$db"
done

echo "race 1 two reminder runs at once:   $ok1/$N one run worked, the other stepped aside; one swap, one notice, one calendar block"
echo "race 2 reminder run vs. confirm:    $ok2/$N consistent (A confirmed and kept it $confirmed_first times; replaced first, late confirm refused $swapped_first times)"
exit $fail

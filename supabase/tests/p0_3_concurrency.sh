#!/usr/bin/env bash
# P0-3 concurrency checks with real simultaneous sessions, on THROWAWAY local
# databases copied from a template that already has the shim, the production
# snapshots, the P0-1, P0-2 and P0-3 migrations and the committed P0-3 seed
# (run_p0_3_tests.sh builds it).
#
#   race 1  two approved drivers accept the same open job at the same moment
#   race 2  one driver accepts two jobs that overlap, at the same moment
#   race 3  a driver who is not approved and an approved one race for a job
#   race 4  the company assigns a job to one driver while another accepts it
#
# Usage: p0_3_concurrency.sh <template database> [rounds]
set -euo pipefail
TPL="${1:?template database}"
N="${2:-10}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
id() { q "$TPL" "select tests.p3('$1')"; }
E1=$(id E1); E3=$(id E3); U=$(id U); C1=$(id C1); VE1=$(id vE1); VE3=$(id vE3); VU=$(id vU)

# One session: act as a user, run the call, hold the transaction (and its row
# locks) open a moment so the other session really overlaps.
session() { # $1 db, $2 user, $3 sql returning one value, $4 out file
  psql -X -qAt -d "$1" -c "begin; select tests.act_as('$2'); select 'R:' || ($3); select pg_sleep(0.3); commit;" \
    2>"$4.err" | grep '^R:' | cut -c3- > "$4" || true
}
new_job() { # $1 db, $2 minutes from now -> id of a new open sedan/comfort job
  q "$1" "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
            passenger_name, passenger_phone, price_gel, vehicle_type, vehicle_class)
          values ('$C1', 'transfer', 'pending', (now() + interval '$2 minutes')::text, 'Test airport', 'Test hotel',
                  'Test Passenger', '+000 000 0003', 150, 'sedan', 'comfort')
          returning id"
}
accept_sql() { echo "public.accept_booking_atomic('$1', '$2', '$3') ->> 'code'"; }

fail=0; ok1=0; ok2=0; ok3=0; ok4=0; first_e1=0; first_e3=0; company_won=0; driver_won=0
for i in $(seq 1 "$N"); do
  db="p03_race_${i}"
  dropdb --if-exists "$db" >/dev/null 2>&1; createdb -T "$TPL" "$db"

  # race 1 — E1 and E3 accept the same job at once
  job=$(new_job "$db" 72000)
  session "$db" "$E1" "$(accept_sql "$job" "$E1" "$VE1")" "$TMP/1a" &
  session "$db" "$E3" "$(accept_sql "$job" "$E3" "$VE3")" "$TMP/1b" &
  wait
  r="$(cat "$TMP/1a"),$(cat "$TMP/1b")"
  state=$(q "$db" "select status || ',' || (select count(*) from public.driver_schedules where booking_id = '$job')
                     from public.bookings where id = '$job'")
  if [[ "$state" == "accepted,1" && ( "$r" == "accepted,not_pending" || "$r" == "not_pending,accepted" ) ]]; then
    ok1=$((ok1+1)); [[ "$r" == accepted,* ]] && first_e1=$((first_e1+1)) || first_e3=$((first_e3+1))
  else fail=1; echo "race 1 #$i FAILED: results=$r state=$state $(cat "$TMP"/1*.err)"; fi

  # race 2 — E1 accepts two overlapping jobs at once
  a=$(new_job "$db" 73000); b=$(new_job "$db" 73030)
  session "$db" "$E1" "$(accept_sql "$a" "$E1" "$VE1")" "$TMP/2a" &
  session "$db" "$E1" "$(accept_sql "$b" "$E1" "$VE1")" "$TMP/2b" &
  wait
  r="$(cat "$TMP/2a"),$(cat "$TMP/2b")"
  blocks=$(q "$db" "select count(*) from public.driver_schedules where booking_id in ('$a', '$b') and driver_id = '$E1'")
  if [[ "$blocks" == 1 && ( "$r" == "accepted,driver_busy" || "$r" == "driver_busy,accepted" ) ]]; then ok2=$((ok2+1));
  else fail=1; echo "race 2 #$i FAILED: results=$r calendar blocks=$blocks $(cat "$TMP"/2*.err)"; fi

  # race 3 — U (not approved) and E1 race for the same job
  job=$(new_job "$db" 74000)
  session "$db" "$U" "$(accept_sql "$job" "$U" "$VU")" "$TMP/3a" &
  session "$db" "$E1" "$(accept_sql "$job" "$E1" "$VE1")" "$TMP/3b" &
  wait
  r="$(cat "$TMP/3a"),$(cat "$TMP/3b")"
  who=$(q "$db" "select coalesce(driver_id::text, 'none') from public.bookings where id = '$job'")
  if [[ "$r" == "not_eligible,accepted" && "$who" == "$E1" ]]; then ok3=$((ok3+1));
  else fail=1; echo "race 3 #$i FAILED: results=$r driver=$who $(cat "$TMP"/3*.err)"; fi

  # race 4 — the company gives the job to E3 while E1 accepts it
  job=$(new_job "$db" 75000)
  if (( i % 2 )); then
    session "$db" "$C1" "$(accept_sql "$job" "$E3" "$VE3")" "$TMP/4a" &
    session "$db" "$E1" "$(accept_sql "$job" "$E1" "$VE1")" "$TMP/4b" &
  else
    session "$db" "$E1" "$(accept_sql "$job" "$E1" "$VE1")" "$TMP/4b" &
    session "$db" "$C1" "$(accept_sql "$job" "$E3" "$VE3")" "$TMP/4a" &
  fi
  wait
  r="$(cat "$TMP/4a"),$(cat "$TMP/4b")"
  state=$(q "$db" "select coalesce(driver_id::text, 'none') || ',' || (select count(*) from public.driver_schedules where booking_id = '$job')
                     from public.bookings where id = '$job'")
  if [[ "$r" == "accepted,not_pending" && "$state" == "$E3,1" ]]; then ok4=$((ok4+1)); company_won=$((company_won+1));
  elif [[ "$r" == "not_pending,accepted" && "$state" == "$E1,1" ]]; then ok4=$((ok4+1)); driver_won=$((driver_won+1));
  else fail=1; echo "race 4 #$i FAILED: results=$r state=$state $(cat "$TMP"/4*.err)"; fi

  dropdb "$db"
done

echo "race 1 two drivers, one job:        $ok1/$N exactly one driver, one calendar block (E1 first $first_e1, E3 first $first_e3)"
echo "race 2 one driver, two overlaps:    $ok2/$N one accepted, the other refused as driver_busy, one calendar block"
echo "race 3 not approved vs approved:    $ok3/$N the approved driver gets it, the other is refused as not_eligible"
echo "race 4 company assigns vs accept:   $ok4/$N exactly one winner (company first $company_won, driver first $driver_won)"
exit $fail

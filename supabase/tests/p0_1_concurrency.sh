#!/usr/bin/env bash
# P0-1 concurrency checks: real simultaneous sessions against a THROWAWAY local
# database that already has the shim, the production snapshot, the P0-1
# migration and the seed (run_p0_1_tests.sh does all of that).
#
#   race 1  two drivers accept the same open job at the same moment
#   race 2  one driver declines while another accepts the same job
#   race 3  the same driver sends two declines at the same moment
#
# Usage: p0_1_concurrency.sh <database> [iterations]
set -euo pipefail
DB="${1:?database name}"
N="${2:-20}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac

A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
C=cccccccc-cccc-4ccc-8ccc-cccccccccccc
VB=bbbbbbbb-0000-4000-8000-00000000000b
VC=cccccccc-0000-4000-8000-00000000000c
COMPANY=11111111-1111-4111-8111-111111111111
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

new_open_job() { # $1 = date_display
  q "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
       passenger_name, passenger_phone, price_gel, vehicle_type, vehicle_class)
     values ('$COMPANY', 'transfer', 'pending', '$1', 'Test airport', 'Test hotel',
       'Test Passenger', '+000 000 0001', 100, 'sedan', 'comfort') returning id"
}

# One session: act as a driver, run the call, keep the transaction (and any
# row lock) open a moment so the other session really overlaps.
session() { # $1 = user, $2 = sql returning one value, $3 = output file
  psql -X -qAt -d "$DB" -c "begin; select tests.act_as('$1'); select ($2); select pg_sleep(0.3); commit;" \
    2>"$3.err" | grep -v '^$' | head -1 > "$3" || true
}

fail=0
pass_1=0; pass_2=0; pass_3=0; dec_first=0; acc_first=0

for i in $(seq 1 "$N"); do
  # race 1 — accept vs accept
  day=$(date -u -d "2027-01-01 +$i days" +%Y-%m-%d)
  id=$(new_open_job "$day 10:00:00+04")
  if (( i % 2 )); then first=$B; second=$C; else first=$C; second=$B; fi
  session "$first"  "public.accept_booking_atomic('$id', '$first',  case when '$first'  = '$B' then '$VB'::uuid else '$VC'::uuid end) ->> 'code'" "$TMP/r1a" &
  session "$second" "public.accept_booking_atomic('$id', '$second', case when '$second' = '$B' then '$VB'::uuid else '$VC'::uuid end) ->> 'code'" "$TMP/r1b" &
  wait
  codes="$(cat "$TMP/r1a") $(cat "$TMP/r1b")"
  winners=$(echo "$codes" | tr ' ' '\n' | grep -c '^accepted$' || true)
  state=$(q "select status || ',' || (driver_id in ('$B','$C')) || ',' || (select count(*) from public.driver_schedules s where s.booking_id = b.id) from public.bookings b where id = '$id'")
  if [[ "$winners" == 1 && "$state" == "accepted,true,1" ]]; then pass_1=$((pass_1+1)); else fail=1; echo "race 1 #$i FAILED: codes=[$codes] state=$state $(cat "$TMP"/*.err)"; fi

  # race 2 — decline vs accept
  day=$(date -u -d "2027-03-01 +$i days" +%Y-%m-%d)
  id=$(new_open_job "$day 10:00:00+04")
  session "$A" "public.reject_pending_booking_as_driver('$id')::text" "$TMP/r2a" &
  session "$B" "public.accept_booking_atomic('$id', '$B', '$VB') ->> 'code'" "$TMP/r2b" &
  wait
  state=$(q "select status || ',' || coalesce(driver_id::text, '-') from public.bookings where id = '$id'")
  if [[ "$(cat "$TMP/r2a")" == true ]]; then dec_first=$((dec_first+1)); else acc_first=$((acc_first+1)); fi
  if [[ "$(cat "$TMP/r2b")" == accepted && "$state" == "accepted,$B" ]]; then pass_2=$((pass_2+1)); else fail=1; echo "race 2 #$i FAILED: decline=$(cat "$TMP/r2a") accept=$(cat "$TMP/r2b") state=$state $(cat "$TMP"/*.err)"; fi

  # race 3 — duplicate declines by the same driver
  day=$(date -u -d "2027-05-01 +$i days" +%Y-%m-%d)
  id=$(new_open_job "$day 10:00:00+04")
  session "$A" "public.reject_pending_booking_as_driver('$id')::text" "$TMP/r3a" &
  session "$A" "public.reject_pending_booking_as_driver('$id')::text" "$TMP/r3b" &
  wait
  state=$(q "select status || ',' || (driver_id is null) || ',' || (select count(*) from public.booking_driver_declines d where d.booking_id = b.id) from public.bookings b where id = '$id'")
  if [[ "$(cat "$TMP/r3a")" == true && "$(cat "$TMP/r3b")" == true && "$state" == "pending,true,1" ]]; then pass_3=$((pass_3+1)); else fail=1; echo "race 3 #$i FAILED: $(cat "$TMP/r3a")/$(cat "$TMP/r3b") state=$state $(cat "$TMP"/*.err)"; fi
done

echo "race 1 accept vs accept:       $pass_1/$N exactly one driver, one calendar block"
echo "race 2 decline vs accept:      $pass_2/$N accepted by B, never rejected (decline landed first $dec_first times, after the accept $acc_first times)"
echo "race 3 duplicate declines:     $pass_3/$N both answered, one decline row, job still open"
exit $fail

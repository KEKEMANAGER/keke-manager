#!/usr/bin/env bash
# P0-5 concurrency checks with real simultaneous sessions, on THROWAWAY local
# databases copied from a template that already has the shim, the production
# snapshots, P0-1..P0-5 and the committed P0-5 seed (run_p0_5_tests.sh builds
# it). Nothing leaves the machine: net.http_post is the shim's recorder.
#
#   race 1  the company cancels an open booking while a driver accepts it
#   race 2  the company cancels while the reminder worker replaces the
#           unconfirmed driver (45 minutes before pickup, a free driver E4)
#   race 3  the company cancels twice at once (a double tap, two devices)
#   race 4  the company cancels while the driver cancels (and his app has
#           the server tell the company)
#   race 5  the company cancels an open booking while the outbox flush sends
#           its second wave
#   race 6  the company cancels a convoy and one of its cars at the same
#           moment (two taps, two devices)
#
# Whatever the order, the booking ends cancelled, holds nobody's calendar,
# and each person is told what happened to him once — the driver on it when
# it was cancelled hears of the cancellation, the company hears "the driver
# cancelled" only if the driver did. Each round also counts which side won.
#
# Usage: p0_5_concurrency.sh <template database> [rounds]
set -euo pipefail
TPL="${1:?template database}"
N="${2:-10}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
id() { q "$TPL" "select tests.p5('$1')"; }
C1=$(id C1); E1=$(id E1); E4=$(id E4); VE1=$(id vE1)

# One session: optionally act as a user, run the call, hold the transaction
# (and its locks) open a moment so the other session really overlaps.
session() { # $1 db, $2 user or "owner", $3 sql returning one value, $4 out file, $5 seconds to wait first
  local who=""
  [[ "$2" != owner ]] && who="select tests.act_as('$2');"
  psql -X -qAt -d "$1" -c "begin; select pg_sleep(${5:-0}); $who select 'R:' || coalesce(($3)::text, ''); select pg_sleep(0.3); commit;" \
    2>"$4.err" | grep '^R:' | cut -c3- > "$4" || true
}
new_job() { # $1 db, $2 minutes from now -> id of a new open sedan/comfort job of C1
  q "$1" "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
            price_gel, vehicle_type, vehicle_class, passengers)
          values ('$C1', 'transfer', 'pending', (now() + interval '$2 minutes')::text, 'Test airport', 'Test hotel',
                  150, 'sedan', 'comfort', 2)
          returning id"
}
taken_job() { # $1 db, $2 minutes from now -> a job E1 has accepted
  local j; j=$(new_job "$1" "$2")
  q "$1" "begin; select tests.act_as('$C1'); select public.accept_booking_atomic('$j', '$E1', '$VE1'); commit;" >/dev/null
  echo "$j"
}
state() { # $1 db, $2 job -> "status,calendar rows,history lines"
  q "$1" "select b.status || ',' || (select count(*) from public.driver_schedules s where s.booking_id = b.id)
                  || ',' || tests.history_lines(b.id)
            from public.bookings b where b.id = '$2'"
}

fail=0
ok1=0; w1a=0; w1c=0; ok2=0; w2r=0; w2c=0; w2s=0; ok3=0; ok4=0; w4c=0; w4d=0; ok5=0; w5f=0; w5c=0; ok6=0; w6c=0; w6m=0
for i in $(seq 1 "$N"); do
  db="p05_race_${i}"
  dropdb --if-exists "$db" >/dev/null 2>&1; createdb -T "$TPL" "$db"

  # race 1 — cancel vs a driver's acceptance
  job=$(new_job "$db" 57600)
  session "$db" "$C1" "public.cancel_booking_by_company('$job', 'race') ->> 'code'" "$TMP/1a" &
  session "$db" "$E1" "public.accept_booking_atomic('$job', '$E1', '$VE1') ->> 'code'" "$TMP/1b" &
  wait
  a=$(cat "$TMP/1a"); b=$(cat "$TMP/1b"); s=$(state "$db" "$job")
  told=$(q "$db" "select tests.notices('$E1', 'booking_cancelled', '$job')")
  if [[ "$a" == cancelled && "$s" == "cancelled,0,1" && \
        ( ( "$b" == accepted && "$told" == 1 ) || ( "$b" == not_pending && "$told" == 0 ) ) ]]; then
    ok1=$((ok1+1)); [[ "$b" == accepted ]] && w1a=$((w1a+1)) || w1c=$((w1c+1))
  else fail=1; echo "race 1 #$i FAILED: cancel=$a accept=$b state=$s told=$told $(cat "$TMP"/1*.err)"; fi

  # race 2 — cancel vs the reminder worker's replacement (every other round
  # the cancel starts a moment later, so both orders happen)
  job=$(taken_job "$db" 45)
  session "$db" "$C1" "public.cancel_booking_by_company('$job', 'race') ->> 'code'" "$TMP/2a" "$( (( i % 2 )) && echo 0.15 || echo 0 )" &
  session "$db" owner "public.run_booking_reminders() ->> 'reassigned'" "$TMP/2b" &
  wait
  a=$(cat "$TMP/2a"); b=$(cat "$TMP/2b"); s=$(state "$db" "$job")
  r=$(q "$db" "select b.driver_id::text || ',' || tests.notices(b.driver_id, 'booking_cancelled', b.id)
                      || ',' || (select count(*) from public.notifications n where n.type = 'booking_cancelled' and n.data ->> 'booking_id' = b.id::text)
                      || ',' || (select count(*) from public.notifications n where n.type = 'booking_driver_unconfirmed' and n.data ->> 'bookingId' = b.id::text)
                 from public.bookings b where b.id = '$job'")
  drv=${r%%,*}; rest=${r#*,}
  if [[ "$a" == cancelled && "$s" == "cancelled,0,1" && "$rest" == "1,1,0" && \
        ( ( "$b" == 1 && "$drv" == "$E4" ) || ( "$b" == 0 && "$drv" == "$E1" ) ) ]]; then
    ok2=$((ok2+1)); [[ "$b" == 1 ]] && w2r=$((w2r+1)) || w2c=$((w2c+1))
    # the worker's run had already read the booking when the cancel landed: its
    # 45-minute reminder went out in the same instant as the cancellation notice
    [[ "$b" == 0 && $(q "$db" "select count(*) from public.notifications n where n.user_id = '$E1' and n.type = 'booking_reminder_final' and n.data ->> 'bookingId' = '$job'") != 0 ]] && w2s=$((w2s+1))
  else fail=1; echo "race 2 #$i FAILED: cancel=$a reassigned=$b state=$s driver,told,all,alerts=$r $(cat "$TMP"/2*.err)"; fi

  # race 3 — the company cancels twice at once
  q "$db" "delete from net.http_calls" >/dev/null
  job=$(taken_job "$db" 59040)
  session "$db" "$C1" "public.cancel_booking_by_company('$job', 'race') ->> 'code'" "$TMP/3a" &
  session "$db" "$C1" "public.cancel_booking_by_company('$job', 'race') ->> 'code'" "$TMP/3b" &
  wait
  ab="$(cat "$TMP/3a")+$(cat "$TMP/3b")"; s=$(state "$db" "$job")
  t=$(q "$db" "select tests.notices('$E1', 'booking_cancelled', '$job') || ',' || tests.pushes_to(tests.tok5('E1'))")
  if [[ ( "$ab" == "cancelled+already_cancelled" || "$ab" == "already_cancelled+cancelled" ) \
        && "$s" == "cancelled,0,1" && "$t" == "1,1" ]]; then ok3=$((ok3+1));
  else fail=1; echo "race 3 #$i FAILED: results=$ab state=$s notices,pushes=$t $(cat "$TMP"/3*.err)"; fi

  # race 4 — the company and the driver cancel at once
  job=$(taken_job "$db" 60480)
  session "$db" "$C1" "public.cancel_booking_by_company('$job', 'race') ->> 'code'" "$TMP/4a" &
  ( psql -X -qAt -d "$db" -c "begin; select tests.act_as('$E1');
       update public.bookings set status = 'cancelled' where id = '$job'; select pg_sleep(0.3); commit;" \
       >/dev/null 2>"$TMP/4b.err"
    session "$db" "$E1" "public.notify_booking_event('$job', 'driver_cancelled')" "$TMP/4b" ) &
  wait
  a=$(cat "$TMP/4a"); b=$(cat "$TMP/4b"); s=$(state "$db" "$job")
  r=$(q "$db" "select cancelled_by || ',' || tests.notices('$E1', 'booking_cancelled', id)
                      || ',' || tests.notices('$C1', 'booking_driver_cancelled', id)
                 from public.bookings where id = '$job'")
  if [[ "$s" == "cancelled,0,1" && \
        ( ( "$a" == cancelled && "$r" == "company,1,0" && "$b" == 0 ) || \
          ( "$a" == already_cancelled && "$r" == "driver,0,1" && "$b" == 1 ) ) ]]; then
    ok4=$((ok4+1)); [[ "$a" == cancelled ]] && w4c=$((w4c+1)) || w4d=$((w4d+1))
  else fail=1; echo "race 4 #$i FAILED: company=$a told_company=$b state=$s by,driver_told,company_told=$r $(cat "$TMP"/4*.err)"; fi

  # race 5 — cancel vs the flush of a waiting second wave (every other round
  # the flush starts a moment later)
  job=$(new_job "$db" 61920)
  q "$db" "insert into public.push_outbox (booking_id, user_id, token, title, body, data, send_after)
           values ('$job', '$E1', '', 't', 'b', '{}'::jsonb, now() - interval '1 second')" >/dev/null
  session "$db" "$C1" "public.cancel_booking_by_company('$job', 'race') ->> 'code'" "$TMP/5a" &
  session "$db" owner "public.flush_push_outbox()" "$TMP/5b" "$( (( i % 2 )) && echo 0.15 || echo 0 )" &
  wait
  a=$(cat "$TMP/5a"); b=$(cat "$TMP/5b"); s=$(state "$db" "$job")
  r=$(q "$db" "select tests.notices('$E1', 'new_booking', '$job') || ','
                      || (select count(*) from public.push_outbox o where o.booking_id = '$job' and o.sent_at is null)")
  if [[ "$a" == cancelled && "$s" == "cancelled,0,1" && ( "$r" == "1,0" || "$r" == "0,0" ) ]]; then
    ok5=$((ok5+1)); [[ "$r" == "1,0" ]] && w5f=$((w5f+1)) || w5c=$((w5c+1))
  else fail=1; echo "race 5 #$i FAILED: cancel=$a flushed=$b state=$s told,waiting=$r $(cat "$TMP"/5*.err)"; fi

  # race 6 — a convoy and one of its cars cancelled at once
  mst=$(q "$db" "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
                   price_gel, vehicle_type, vehicle_class, passengers, is_group_master)
                 values ('$C1', 'transfer', 'pending', (now() + interval '45 days')::text, 'Test airport', 'Test hotel',
                         300, 'sedan', 'comfort', 4, true) returning id")
  leg1=$(q "$db" "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
                    price_gel, vehicle_type, vehicle_class, passengers, parent_booking_id, leg_index)
                  values ('$C1', 'transfer', 'pending', (now() + interval '45 days')::text, 'Test airport', 'Test hotel',
                          150, 'sedan', 'comfort', 2, '$mst', 1) returning id")
  leg2=$(q "$db" "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
                    price_gel, vehicle_type, vehicle_class, passengers, parent_booking_id, leg_index)
                  values ('$C1', 'transfer', 'pending', (now() + interval '45 days')::text, 'Test airport', 'Test hotel',
                          150, 'sedan', 'comfort', 2, '$mst', 2) returning id")
  q "$db" "begin; select tests.act_as('$C1'); select public.accept_booking_atomic('$leg1', '$E1', '$VE1'); commit;" >/dev/null
  session "$db" "$C1" "public.cancel_booking_by_company('$mst', 'race') ->> 'code'" "$TMP/6a" &
  session "$db" "$C1" "public.cancel_booking_by_company('$leg2', 'race') ->> 'code'" "$TMP/6b" &
  wait
  a=$(cat "$TMP/6a"); b=$(cat "$TMP/6b")
  r=$(q "$db" "select string_agg(status, ',' order by coalesce(leg_index, 0)) from public.bookings
                where id = '$mst' or parent_booking_id = '$mst'")
  t=$(q "$db" "select tests.notices('$E1', 'booking_cancelled', '$leg1')")
  if [[ "$a" == cancelled && ( "$b" == cancelled || "$b" == already_cancelled ) \
        && "$r" == "cancelled,cancelled,cancelled" && "$t" == 1 ]] && ! grep -q 'deadlock' "$TMP"/6*.err; then
    ok6=$((ok6+1)); [[ "$b" == cancelled ]] && w6c=$((w6c+1)) || w6m=$((w6m+1))
  else fail=1; echo "race 6 #$i FAILED: convoy=$a car=$b statuses=$r told=$t $(cat "$TMP"/6*.err)"; fi

  dropdb "$db"
done

echo "race 1 cancel vs a driver's acceptance:  $ok1/$N consistent (accept first $w1a, cancel first $w1c)"
echo "race 2 cancel vs the worker's swap:      $ok2/$N consistent (swap first $w2r, cancel first $w2c; a reminder in the same instant $w2s)"
echo "race 3 the company cancels twice:        $ok3/$N one cancellation, the driver told once"
echo "race 4 company and driver cancel:        $ok4/$N consistent (company first $w4c, driver first $w4d)"
echo "race 5 cancel vs the second-wave flush:  $ok5/$N consistent (flush first $w5f, cancel first $w5c)"
echo "race 6 a convoy and one of its cars:     $ok6/$N no deadlock, all cancelled (car first $w6c, convoy first $w6m)"
exit $fail

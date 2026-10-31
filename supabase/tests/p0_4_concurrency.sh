#!/usr/bin/env bash
# P0-4 concurrency checks with real simultaneous sessions, on THROWAWAY local
# databases copied from a template that already has the shim, the production
# snapshots, P0-1..P0-3, P0-4 and the committed P0-4 seed (run_p0_4_tests.sh
# builds it). Nothing leaves the machine: net.http_post is the shim's recorder.
#
#   race 1  the server's dispatch runs twice for one new booking at once
#           (the app's call, the one-minute fallback, the second wave)
#   race 2  the app dispatches a booking while the one-minute fallback does
#   race 3  one acceptance is announced twice at once (a double tap)
#   race 4  two outbox flushes run over the same waiting second wave
#   race 5  one chat message is announced twice at once
#   race 6  an installed app queues the same second wave twice at once
#
# Each driver must be told once per booking, and each event reach each person
# once. With "report" as the third argument the script only counts (used on
# the state before P0-4, where race 1 tells drivers twice).
#
# Usage: p0_4_concurrency.sh <template database> [rounds] [report]
set -euo pipefail
TPL="${1:?template database}"
N="${2:-10}"
MODE="${3:-check}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
id() { q "$TPL" "select tests.p4('$1')"; }
C1=$(id C1); E1=$(id E1); E2=$(id E2); ACC1=$(id ACC1); MSG1=$(id msg1)
HAS_P4=$(q "$TPL" "select to_regprocedure('public.dispatch_new_booking(uuid,uuid[],uuid[])') is not null")

# One session: optionally act as a user, run the call, hold the transaction
# (and its locks) open a moment so the other session really overlaps.
session() { # $1 db, $2 user or "owner", $3 sql returning one value, $4 out file
  local who=""
  [[ "$2" != owner ]] && who="select tests.act_as('$2');"
  psql -X -qAt -d "$1" -c "begin; $who select 'R:' || coalesce(($3)::text, ''); select pg_sleep(0.3); commit;" \
    2>"$4.err" | grep '^R:' | cut -c3- > "$4" || true
}
new_job() { # $1 db, $2 minutes from now -> id of a new open sedan/comfort job, made 2 minutes ago
  q "$1" "insert into public.bookings (company_id, kind, status, date_display, from_location, to_location,
            passenger_name, passenger_phone, price_gel, vehicle_type, vehicle_class, created_at)
          values ('$C1', 'transfer', 'pending', (now() + interval '$2 minutes')::text, 'Test airport', 'Test hotel',
                  'Test Passenger', '+000 000 0003', 150, 'sedan', 'comfort', now() - interval '2 minutes')
          returning id"
}
told() { # $1 db, $2 booking -> "E1 notices,E2 notices,E1 pushes,E2 pushes"
  q "$1" "select tests.notices('$E1', 'new_booking', '$2') || ',' || tests.notices('$E2', 'new_booking', '$2')"
}
pushes() { # $1 db -> pushes to E1's and E2's phones so far
  q "$1" "select tests.pushes_to(tests.tok('E1')) || ',' || tests.pushes_to(tests.tok('E2'))"
}

fail=0; ok1=0; dup1=0; ok2=0; ok3=0; ok4=0; ok5=0; ok6=0
for i in $(seq 1 "$N"); do
  db="p04_race_${i}"
  dropdb --if-exists "$db" >/dev/null 2>&1; createdb -T "$TPL" "$db"
  q "$db" "delete from net.http_calls; delete from public.notifications;" >/dev/null

  # race 1 — two dispatches of one booking at once
  job=$(new_job "$db" 72000)
  session "$db" owner "public.dispatch_new_booking_push('$job', 1)" "$TMP/1a" &
  session "$db" owner "public.dispatch_new_booking_push('$job', 1)" "$TMP/1b" &
  wait
  t=$(told "$db" "$job"); p=$(pushes "$db")
  if [[ "$t" == "1,1" && "$p" == "1,1" ]]; then ok1=$((ok1+1));
  else dup1=$((dup1+1)); [[ "$MODE" == report ]] || { fail=1; echo "race 1 #$i FAILED: notices=$t pushes=$p $(cat "$TMP"/1*.err)"; }; fi

  if [[ "$HAS_P4" == t ]]; then
    q "$db" "delete from net.http_calls;" >/dev/null
    # race 2 — the app's dispatch and the one-minute fallback at once
    job=$(new_job "$db" 73000)
    session "$db" "$C1" "public.dispatch_new_booking('$job', array['$E1', '$E2']::uuid[], '{}'::uuid[])" "$TMP/2a" &
    session "$db" owner "public.dispatch_missed_new_bookings()" "$TMP/2b" &
    wait
    t=$(told "$db" "$job"); p=$(pushes "$db")
    if [[ "$t" == "1,1" && "$p" == "1,1" ]]; then ok2=$((ok2+1));
    else fail=1; echo "race 2 #$i FAILED: notices=$t pushes=$p $(cat "$TMP"/2*.err)"; fi

    # race 3 — one acceptance announced twice at once
    q "$db" "delete from net.http_calls;" >/dev/null
    session "$db" "$E1" "public.notify_booking_event('$ACC1', 'accepted')" "$TMP/3a" &
    session "$db" "$E1" "public.notify_booking_event('$ACC1', 'accepted')" "$TMP/3b" &
    wait
    r="$(cat "$TMP/3a")+$(cat "$TMP/3b")"
    s=$(q "$db" "select tests.notices('$C1', 'booking_accepted', '$ACC1') || ',' || tests.pushes_to(tests.tok('C1'))")
    if [[ "$s" == "1,1" && ( "$r" == "1+0" || "$r" == "0+1" ) ]]; then ok3=$((ok3+1));
    else fail=1; echo "race 3 #$i FAILED: results=$r notices,pushes=$s $(cat "$TMP"/3*.err)"; fi

    # race 4 — two flushes over the same waiting second wave
    q "$db" "delete from net.http_calls;" >/dev/null
    job=$(new_job "$db" 74000)
    q "$db" "begin; select tests.act_as('$C1'); select public.dispatch_new_booking('$job', '{}'::uuid[], array['$E1', '$E2']::uuid[]); commit;" >/dev/null
    q "$db" "update public.push_outbox set send_after = now() - interval '1 second' where booking_id = '$job'" >/dev/null
    session "$db" owner "public.flush_push_outbox()" "$TMP/4a" &
    session "$db" owner "public.flush_push_outbox()" "$TMP/4b" &
    wait
    t=$(told "$db" "$job"); p=$(pushes "$db")
    if [[ "$t" == "1,1" && "$p" == "1,1" ]]; then ok4=$((ok4+1));
    else fail=1; echo "race 4 #$i FAILED: notices=$t pushes=$p results=$(cat "$TMP/4a")+$(cat "$TMP/4b") $(cat "$TMP"/4*.err)"; fi

    # race 5 — one chat message announced twice at once
    q "$db" "delete from net.http_calls; update public.messages set created_at = now() where id = '$MSG1';" >/dev/null
    session "$db" "$C1" "public.notify_chat_message('$E1', '$MSG1')" "$TMP/5a" &
    session "$db" "$C1" "public.notify_chat_message('$E1', '$MSG1')" "$TMP/5b" &
    wait
    s=$(q "$db" "select tests.notices('$E1', 'chat_message') || ',' || tests.pushes_to(tests.tok('E1'))")
    if [[ "$s" == "1,1" ]]; then ok5=$((ok5+1));
    else fail=1; echo "race 5 #$i FAILED: notices,pushes=$s $(cat "$TMP"/5*.err)"; fi

    # race 6 — an installed app queues the same second wave twice at once
    job=$(new_job "$db" 75000)
    tok=$(q "$db" "select tests.tok('E1')")
    session "$db" "$C1" "public.enqueue_booking_push('$job', array['$tok'], 'x', 'y', '{}'::jsonb, 180)" "$TMP/6a" &
    session "$db" "$C1" "public.enqueue_booking_push('$job', array['$tok'], 'x', 'y', '{}'::jsonb, 180)" "$TMP/6b" &
    wait
    rows=$(q "$db" "select count(*) from public.push_outbox where booking_id = '$job'")
    if [[ "$rows" == 1 ]]; then ok6=$((ok6+1));
    else fail=1; echo "race 6 #$i FAILED: rows=$rows results=$(cat "$TMP/6a")+$(cat "$TMP/6b") $(cat "$TMP"/6*.err)"; fi
  fi

  dropdb "$db"
done

echo "race 1 two dispatches, one booking:     $ok1/$N each driver told once ($dup1 rounds told someone twice)"
if [[ "$HAS_P4" == t ]]; then
  echo "race 2 app dispatch vs fallback:        $ok2/$N each driver told once"
  echo "race 3 acceptance announced twice:      $ok3/$N the company told once"
  echo "race 4 two flushes, one second wave:    $ok4/$N each driver told once"
  echo "race 5 chat message announced twice:    $ok5/$N the receiver told once"
  echo "race 6 second wave queued twice:        $ok6/$N one waiting row"
fi
exit $fail

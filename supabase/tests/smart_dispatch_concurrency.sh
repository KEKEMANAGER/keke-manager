#!/usr/bin/env bash
# Smart dispatch with real simultaneous sessions, on THROWAWAY local databases
# copied from a template that already has the shim, production, the
# 20261105120000_smart_dispatch migration and the committed seed of
# fixtures/smart_dispatch_seed.sql (run_smart_dispatch_tests.sh builds it).
# Nothing leaves the machine: net.http_post is the shim's recorder.
#
#   race 1  the third wave of one job runs twice at once (the every-minute
#           job and a second run of it, or an admin's manual call)
#   race 2  a comfort driver takes the job while its third wave goes out
#   race 3  the job is put back up (wave 1) while its third wave goes out
#
# Whatever wins, each driver is told about the job at most once, nothing
# deadlocks or fails, and a taken job gets no wave after it was taken.
#
# Usage: smart_dispatch_concurrency.sh <template database> [rounds]
set -euo pipefail
TPL="${1:?template database}"
N="${2:-10}"
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
ECO=$(q "$TPL" "select tests.sd('ECO')")
C_LOC=$(q "$TPL" "select tests.sd('C_LOC')")
VC_LOC=$(q "$TPL" "select tests.sd('vC_LOC')")

# One session: optionally act as a user, run the call, hold the transaction
# (and its locks) open a moment so the other session really overlaps.
session() { # $1 db, $2 user or "owner", $3 sql returning one value, $4 out file
  local who=""
  [[ "$2" != owner ]] && who="select tests.act_as('$2');"
  psql -X -qAt -d "$1" -c "begin; $who select 'R:' || coalesce(($3)::text, ''); select pg_sleep(0.3); commit;" \
    2>"$4.err" | grep '^R:' | cut -c3- > "$4" || true
}
# the most notices any one driver has about ECO
most_told() { q "$1" "select coalesce(max(c), 0) from (select count(*) c from public.notifications
                        where type = 'new_booking' and data ->> 'booking_id' = '$ECO' group by user_id) x"; }
errors() { cat "$TMP"/*.err 2>/dev/null | grep -E 'ERROR|deadlock' || true; }

fail=0; ok1=0; ok2=0; ok3=0
for i in $(seq 1 "$N"); do
  db="keke_smart_race_${i}"
  dropdb --if-exists "$db" >/dev/null 2>&1; createdb -T "$TPL" "$db"
  rm -f "$TMP"/*
  # ECO launched ten minutes ago: waves 1 and 2 out, the third one due
  q "$db" "select public.dispatch_new_booking_push('$ECO', 1); select tests.sd_advance(3, array['ECO']);
           select public.dispatch_due_second_waves(); select tests.sd_advance(7, array['ECO']);" >/dev/null

  # race 1 - two third waves at once
  session "$db" owner "public.dispatch_new_booking_push('$ECO', 3)" "$TMP/a" &
  session "$db" owner "public.dispatch_due_second_waves()" "$TMP/b" &
  wait
  if [ "$(most_told "$db")" = "1" ] && [ "$(q "$db" "select tests.sd_told('ECO')")" = "C_FAR,C_LOC,E_BIG,E_FAR,E_LOC,E_NOL,E_NUL,G_ECO,HOST,SUB,W_ALL" ] \
     && [ -z "$(errors)" ]; then ok1=$((ok1 + 1)); else echo "race 1 round $i: $(q "$db" "select tests.sd_told('ECO')") $(errors)"; fail=1; fi

  # race 2 - put back up (a new launch), then a comfort driver takes it while the next third wave goes out
  rm -f "$TMP"/*
  q "$db" "delete from public.notifications; select public.dispatch_new_booking_push('$ECO', 1);
           select tests.sd_advance(10, array['ECO']);" >/dev/null
  session "$db" "$C_LOC" "public.accept_booking_atomic('$ECO', '$C_LOC', '$VC_LOC') ->> 'ok'" "$TMP/c" &
  session "$db" owner "public.dispatch_due_second_waves()" "$TMP/d" &
  wait
  st=$(q "$db" "select status || ':' || coalesce(tests.sd_name(driver_id), '-') from public.bookings where id = '$ECO'")
  n1=$(q "$db" "select count(*) from public.notifications where type = 'new_booking' and data ->> 'booking_id' = '$ECO'")
  # once taken, no wave reaches anyone any more
  q "$db" "select public.dispatch_due_second_waves(); select public.dispatch_new_booking_push('$ECO', 3);
           select public.dispatch_new_booking_push('$ECO', 2);" >/dev/null
  n2=$(q "$db" "select count(*) from public.notifications where type = 'new_booking' and data ->> 'booking_id' = '$ECO'")
  if [ "$(cat "$TMP/c")" = "true" ] && [ "$st" = "accepted:C_LOC" ] && [ "$(most_told "$db")" -le 1 ] && [ "$n1" = "$n2" ] \
     && [ -z "$(errors)" ]; then
    ok2=$((ok2 + 1)); else echo "race 2 round $i: accept=$(cat "$TMP/c") state=$st notices $n1 then $n2 $(errors)"; fail=1; fi

  # race 3 - a new launch while the third wave goes out
  rm -f "$TMP"/*
  q "$db" "update public.bookings set status = 'pending', driver_id = null, vehicle_id = null, driver_display_name = null,
                  driver_phone = null, driver_plate = null, dispatch_wave2_due_at = null,
                  dispatch_wave3_due_at = now() - interval '1 minute'
            where id = '$ECO';
           delete from public.driver_schedules where booking_id = '$ECO';
           delete from public.notifications;" >/dev/null
  session "$db" owner "public.dispatch_new_booking_push('$ECO', 1)" "$TMP/e" &
  session "$db" owner "public.dispatch_due_second_waves()" "$TMP/f" &
  wait
  state=$(q "$db" "select (dispatch_wave3_sent_at is not null)::text || ',' || (dispatch_wave3_due_at is not null)::text from public.bookings where id = '$ECO'")
  # either the wave ran first (sent, and the launch then cleared it and set a new due time)
  # or the launch ran first (the wave found it not yet due)
  if [ "$(most_told "$db")" = "1" ] && [ "$state" = "false,true" ] && [ -z "$(errors)" ]; then
    ok3=$((ok3 + 1)); else echo "race 3 round $i: state=$state most=$(most_told "$db") $(errors)"; fail=1; fi

  dropdb "$db" >/dev/null 2>&1 || true
done
echo "  race 1 (two third waves at once): $ok1/$N told once"
echo "  race 2 (a driver takes it during the third wave): $ok2/$N taken once, nobody told twice"
echo "  race 3 (a new launch during the third wave): $ok3/$N told once, the new launch's wave 3 waiting"
exit $fail

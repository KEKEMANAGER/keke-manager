#!/usr/bin/env bash
# GPS P0-2 races, on a THROWAWAY local PostgreSQL: a driver finishes his trip
# while his phone's trip task (an app that does not stop it) keeps sending
# positions and road points. Whatever order they land in:
#   * the phone never gets an error (an installed app's queue must not jam);
#   * the trip ends completed;
#   * after the server's tidy job the driver has no position left and his
#     company sees none;
#   * the road holds no point recorded more than two minutes after the end.
# usage: gps_p0_concurrency.sh <database with the GPS migrations and the
#        committed fixtures/gps_p0_seed.sql> [rounds]
set -euo pipefail
DB=$1
ROUNDS=${2:-10}
case "${PGHOST:-}" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
q() { psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

for r in $(seq 1 "$ROUNDS"); do
  # the scene: LIVE_A under way again, D1's position live
  q >/dev/null <<'SQL'
begin;
set local session_replication_role = replica;
update public.bookings set status = 'in_progress', completed_at = null where id = tests.gp('LIVE_A');
delete from public.driver_location_trail where booking_id = tests.gp('LIVE_A') and recorded_at > now() - interval '1 hour';
set local session_replication_role = origin;
select tests.set_pin(tests.gp('D1'), 'background', now());
commit;
SQL
  # A: D1 finishes the trip (the transaction stays open a moment)
  ( psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" >"$OUT/a.$r" 2>&1 <<'SQL'
begin;
select tests.act_as(tests.gp('D1'));
select public.complete_in_progress_booking_as_driver(tests.gp('LIVE_A'));
select pg_sleep(0.15);
commit;
SQL
  ) &
  # B: his phone keeps reporting meanwhile
  ( for k in $(seq 1 12); do
      psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" \
        -c "select tests.app_report(tests.gp('D1'), 'background', 41.70 + $k / 1000.0, 44.80)" \
        -c "select tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), clock_timestamp())"
      sleep 0.02
    done >"$OUT/b.$r" 2>&1 ) &
  wait
  if ! grep -qx 't' "$OUT/a.$r"; then echo "round $r: finishing the trip failed: $(tr '\n' ' ' <"$OUT/a.$r")"; exit 1; fi
  bad=$(grep -vxE '0|1' "$OUT/b.$r" || true)
  if [ -n "$bad" ]; then echo "round $r: the phone got an answer other than written/skipped: $bad"; exit 1; fi
  q -c "select public.gps_tidy_pins()" >/dev/null
  state=$(q -c "select (select status from public.bookings where id = tests.gp('LIVE_A'))
                   || ' pin=' || tests.has_pin(tests.gp('D1'))
                   || ' company_sees=' || tests.pins_seen_by(tests.gp('CA'))
                   || ' late_points=' || (select count(*) from public.driver_location_trail t join public.bookings b on b.id = t.booking_id
                                          where t.booking_id = tests.gp('LIVE_A') and t.recorded_at > b.completed_at + interval '2 minutes')")
  if [ "$state" != "completed pin=false company_sees=S late_points=0" ]; then
    echo "round $r: $state"; exit 1
  fi
done
echo "   $ROUNDS rounds: finishing a trip against its phone's reports - no error to the phone, nothing left after the end"

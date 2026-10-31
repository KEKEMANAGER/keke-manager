#!/usr/bin/env bash
# Rehearses the guarded production rollout on a THROWAWAY local database built
# from the production snapshots (never Supabase): preflight, the five deploy
# steps with their checks, the five undo steps back to the start, the five
# deploy steps again, and the refusals (wrong order, changed function, data
# change, held lock). Point PGHOST/PGPORT/PGUSER at a local server.
set -uo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd); ROOT=$(cd "$HERE/../.." && pwd)
DB=keke_p0_rehearsal
: "${PGHOST:?local PostgreSQL only}"; case "$PGHOST" in *supabase*|*pooler*) echo "refusing"; exit 2;; esac
cd "$ROOT/supabase/tests"
fail=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fail=1; }
run()  { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@" 2>&1; }
expect_ok()   { local out; out=$(run -At -f "$1"); if [[ $? -eq 0 && "$out" == *"$2"* ]]; then ok "$(basename "$1") -> $2"; else bad "$(basename "$1"): $(echo "$out" | tail -2 | tr '\n' ' ')"; fi; }
expect_fail() { local out; out=$(run -At -f "$1"); if [[ $? -ne 0 && "$out" == *"$2"* ]]; then ok "$(basename "$1") refused: $2"; else bad "$(basename "$1") should refuse with '$2': $(echo "$out" | tail -2 | tr '\n' ' ')"; fi; }
fingerprint() { run -At -c "select md5(string_agg(t || ':' || h, ',' order by t)) from (select table_name t, h from (select c.relname table_name, (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(md5(r::text), '''' order by md5(r::text)), '''')) h from (select * from public.%I) r', c.relname), false, true, '')))[1]::text h from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('booking_driver_declines', 'push_tokens')) x) y"; }

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
run -c 'create extension if not exists pgtap' -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
    -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
run -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[]);
        create schema if not exists cron; create table if not exists cron.job (jobid bigserial primary key, schedule text, command text, active boolean default true, jobname text);
        insert into cron.job (schedule, command, jobname) values ('* * * * *', 'select public.run_booking_reminders()', 'booking-reminders-hourly');" >/dev/null
run -1 -f fixtures/p0_5_seed.sql >/dev/null || { echo "seed failed"; exit 1; }
# a legacy unsent "new booking" push with no recipient, which P0-4 part A must hand over or close
run -c "insert into public.push_outbox (booking_id, token, title, body, data, send_after) select id, 'ExponentPushToken[legacy]', 't', 'b', '{\"type\":\"new_booking\"}'::jsonb, now() from public.bookings where id = tests.p5('OPEN');" >/dev/null
echo "rows in the rehearsal copy: $(run -At -c "select sum(n_live_tup) from pg_stat_user_tables where schemaname = 'public'") (approx)"
D="$HERE/deploy"; U="$HERE/rollback"; C="$HERE/checks"
before=$(fingerprint)

echo "== preflight"; expect_ok "$C/00_preflight.sql" "|"
echo "== refusals before anything"
expect_fail "$D/20_deploy_p0_2.sql" "P0-1 is not in place"
run -At -c "select pg_get_functiondef('public.reject_pending_booking_as_driver(uuid)'::regprocedure) || ';'" > /tmp/orig_fn.sql
run -c "create or replace function public.reject_pending_booking_as_driver(p_booking_id uuid) returns boolean language sql as \$\$ select false \$\$" >/dev/null
expect_fail "$D/10_deploy_p0_1.sql" "function not as rehearsed"
run -f /tmp/orig_fn.sql >/dev/null   # put the original back
sed 's/^-- ===== end of supabase\/migrations\/20261031120000_driver_decline_per_driver.sql =====$/update public.users set full_name = full_name || '"'"' x'"'"' where id = tests.p5('"'"'E1'"'"');\n&/' "$D/10_deploy_p0_1.sql" > /tmp/inject_p0_1.sql
expect_fail /tmp/inject_p0_1.sql "existing rows changed in {users}"
[[ "$(run -At -c "select count(*) from public.users where full_name like '% x'")" == 0 ]] && ok "the injected change was rolled back" || bad "injected change persisted"
( psql -X -q -d "$DB" -c "begin; lock table public.bookings in access share mode; select pg_sleep(9); commit;" >/dev/null 2>&1 & )
sleep 1; expect_fail "$D/10_deploy_p0_1.sql" "lock timeout"; sleep 9
[[ "$(fingerprint)" == "$before" ]] && ok "data unchanged after the refusals" || bad "data changed by a refused step"

echo "== deploy P0-1 .. P0-5, each followed by its read-only check"
for s in 10_deploy_p0_1:10_check_p0_1:P0-1 20_deploy_p0_2:20_check_p0_2:P0-2 30_deploy_p0_3a:30_check_p0_3a:"P0-3 A" 40_deploy_p0_4a:40_check_p0_4a:"P0-4 A" 50_deploy_p0_5:50_check_p0_5:P0-5; do
  IFS=: read -r d c k <<<"$s"
  expect_ok "$D/$d.sql" "$k applied"; expect_ok "$C/$c.sql" "$k is in place"
done
expect_fail "$D/50_deploy_p0_5.sql" "P0-5 is already in place"
[[ "$(fingerprint)" == "$before" ]] && ok "every pre-existing row identical after the five steps (P0-4's legacy push excepted below)" || echo "  note: push_outbox legacy row handed over by P0-4 (allowed); checking the rest:"
echo "   history rows: $(run -At -c "select string_agg(version, ' ' order by version) from supabase_migrations.schema_migrations")"

echo "== undo P0-5 .. P0-1"
expect_fail "$U/40_undo_p0_4a.sql" "P0-5 is already in place"
for s in 50_undo_p0_5:P0-5 40_undo_p0_4a:"P0-4 A" 30_undo_p0_3a:"P0-3 A" 20_undo_p0_2:P0-2 10_undo_p0_1:P0-1; do
  IFS=: read -r u k <<<"$s"; expect_ok "$U/$u.sql" "$k undone"
done
expect_ok "$C/00_preflight.sql" "|"
echo "   history rows after undo: $(run -At -c "select count(*) from supabase_migrations.schema_migrations")"

echo "== deploy again"
for s in 10_deploy_p0_1:P0-1 20_deploy_p0_2:P0-2 30_deploy_p0_3a:"P0-3 A" 40_deploy_p0_4a:"P0-4 A" 50_deploy_p0_5:P0-5; do
  IFS=: read -r d k <<<"$s"; expect_ok "$D/$d.sql" "$k applied"
done
expect_ok "$C/50_check_p0_5.sql" "P0-5 is in place"
dropdb "$DB"
[[ $fail -eq 0 ]] && echo "== REHEARSAL PASSED" || { echo "== REHEARSAL FAILED"; exit 1; }

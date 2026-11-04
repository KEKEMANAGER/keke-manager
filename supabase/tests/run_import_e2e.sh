#!/usr/bin/env bash
# Cross-layer check of an imported booking, on a THROWAWAY local PostgreSQL:
#   1. the app builds the booking rows (lib/bookingImport.ts draftToInsertInput);
#   2. the server reviews and approves them (booking-import review.ts);
#   3. the real database trigger accepts exactly those rows — inserted the way
#      PostgREST inserts them, as the company — and refuses the same rows with
#      one critical value changed after approval.
# It proves the three layers agree on how each value is written. Nothing is sent anywhere.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
DB="${IMPORT_TEST_DB:-keke_import_e2e_test}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac
DENO="${DENO:-deno}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
COMPANY=$(psql -X -qAt -d postgres -c "select md5('keke-p0-5-test:C1')::uuid")
cd "$HERE"
# Besides two hand-made bookings: services exactly as the real AI read them in the
# 2026-11-04 test run (invented documents, no real guests).
REAL="${IMPORT_E2E_REAL:-$HERE/fixtures/import_real_reads_2026-11-04.json}"
node import_e2e_app_side.cjs "$WORK/drafts.json" "$COMPANY" "$REAL"
"$DENO" run --quiet --allow-read --allow-write --config "$ROOT/supabase/functions/booking-import/tests/deno.json" "$ROOT/supabase/functions/booking-import/tests/e2e_server_side.ts" "$WORK/drafts.json" "$WORK/approved.json" "$COMPANY"

dropdb --if-exists "$DB" >/dev/null 2>&1; createdb "$DB"
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -c 'create extension if not exists pgtap' \
  -f fixtures/supabase_shim.sql -f fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql \
  -f fixtures/prod_reminders_snapshot_2026-10-31.sql -f fixtures/prod_p0_3_snapshot_2026-10-31.sql \
  -f fixtures/prod_p0_4_snapshot_2026-10-31.sql >/dev/null
for m in 20261031120000_driver_decline_per_driver 20261031150000_reminder_reassign_once 20261031180000_driver_eligibility \
         20261101090000_push_tokens_server_delivery 20261101120000_company_cancellation 20261101150000_booking_ownership \
         20261103200000_booking_import_approvals; do
  psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/migrations/$m.sql" >/dev/null 2>&1 || { echo "apply failed: $m"; exit 1; }
done

python3 - "$WORK/approved.json" "$HERE" > "$WORK/check.sql" <<'PY'
import json, sys
from datetime import datetime, timedelta
cases = json.load(open(sys.argv[1]))
here = sys.argv[2]
def q(s):
    return "'" + s.replace("'", "''") + "'"
def later(iso, **delta):
    t = datetime.fromisoformat(iso.replace('Z', '+00:00')) + timedelta(**delta)
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')
def more_pax(b): b['passengers'] += 1
def more_money(b): b['price_gel'] += 10; b['client_price'] += 10
def later_date(b): b['date_display'] = later(b['date_display'], hours=1)
def day_moved(b): b['tour_days'][1]['date'] = later(b['tour_days'][1]['date'] + 'T00:00:00Z', days=1)[:10]
print('begin;')
print('select * from no_plan();')
print('\\i ' + q(here + '/fixtures/p0_5_seed.sql'))
print("create or replace function tests.e2e_try(p_sql text) returns text language plpgsql as $$ "
      "begin execute p_sql; return 'ok'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;")
print('grant execute on function tests.e2e_try(text) to public;')
print('select tests.act_as_owner();')
for i, c in enumerate(cases):
    for tag in ('ok', 'x'):
        print(f"insert into public.booking_import_approvals (id, company_id, approved) values "
              f"(md5('e2e-{tag}{i}')::uuid, tests.p5('C1'), {q(json.dumps(c['approved'], ensure_ascii=False))}::jsonb);")
print("select tests.act_as(tests.p5('C1'));")
for i, c in enumerate(cases):
    attempts = [('the body the app sends, as approved', 'ok', None, '^ok$'),
                ('passengers changed after approval', 'x', more_pax, '^42501 .*passengers'),
                ('price changed after approval', 'x', more_money, '^42501 .*price_gel'),
                ('date moved after approval', 'x', later_date, '^42501 .*date_display')]
    if c['body'].get('tour_days'):
        attempts.append(('a tour day moved after approval', 'x', day_moved, '^42501 .*tour_days'))
    attempts.append(('the same booking typed into the form (no approval)', None, None, '^ok$'))
    for n, (tag, appr, mutate, want) in enumerate(attempts):
        body = json.loads(json.dumps(c['body']))
        if mutate: mutate(body)
        body.pop('import_approval_id', None)
        body['voucher_code'] = f'E2E-{i}-{n}'
        payload = q(json.dumps(body, ensure_ascii=False)) + '::jsonb'
        cols = list(body.keys())
        if appr is not None:
            cols.append('import_approval_id')
            payload += f" || jsonb_build_object('import_approval_id', md5('e2e-{appr}{i}')::uuid)"
        collist = ', '.join('"' + k + '"' for k in cols)
        # the way PostgREST writes a POST: only the columns in the body, read from the JSON
        sql = f"insert into public.bookings ({collist}) select {collist} from jsonb_populate_record(null::public.bookings, {payload}) r"
        print(f"select matches(tests.e2e_try({q(sql)}), {q(want)}, {q('E2E ' + c['name'] + ': ' + tag)});")
print('select tests.act_as_owner();')
n = len(cases)
print(f"select is((select count(*)::int from public.booking_import_approvals where used_at is not null), {n}, 'E2E each approval used exactly once');")
refused = ', '.join(f"md5('e2e-x{i}')::uuid" for i in range(n))
print(f"select is((select count(*)::int from public.booking_import_approvals where id in ({refused}) and used_at is null), {n}, 'E2E a refused booking does not use up its approval');")
print(f"select is((select count(*)::int from public.bookings b join public.booking_import_approvals a on a.used_booking_id = b.id where b.import_approval_id = a.id), {n}, 'E2E each imported booking points at its approval');")
print('select * from finish();')
print('rollback;')
PY
out=$(psql -X -qAt -v ON_ERROR_STOP=1 -d "$DB" -f "$WORK/check.sql" 2>&1 | grep -E '^(ok|not ok)|ERROR|#' || true)
echo "$out" | grep -E '^(ok|not ok)' || true
dropdb --if-exists "$DB" >/dev/null 2>&1 || true
if [ -z "$out" ] || echo "$out" | grep -qE '^not ok|ERROR'; then echo "$out" | grep -E '^not ok|ERROR|#' | head -20; exit 1; fi
echo "cross-layer check passed"

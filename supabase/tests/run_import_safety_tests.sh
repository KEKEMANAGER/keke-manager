#!/usr/bin/env bash
# Every check of the booking-import safety work, in order. Nothing is sent
# anywhere: the model, Supabase and the network are stand-ins (the function's
# tests run without network permission), and the database steps use a
# THROWAWAY local PostgreSQL (15+ with pgTAP and btree_gist). Point
# PGHOST/PGPORT/PGUSER at it, and DENO at a Deno 2 binary if it is not on PATH.
#
#   1. the function: reading, review, model profiles, retries, logs, approve
#      (supabase/functions/booking-import/tests, a scripted model);
#   2. the app side: review panel logic, approve-then-insert, the manual form
#      untouched, every text in four languages;
#   3. the database check, the P0 suites with it in place, undo, the P0
#      release tools;
#   4. across the three layers: the app's real insert body, approved by the
#      server, accepted by the database; the same body with a value changed
#      after approval, refused.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
DENO="${DENO:-deno}"
: "${PGHOST:?set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL}"
case "$PGHOST" in *supabase*|*pooler*) echo "refusing: PGHOST looks like a Supabase host" >&2; exit 2;; esac

echo "== 1. the function (scripted model, no network permission)"
(cd "$ROOT/supabase/functions/booking-import/tests" && "$DENO" test --quiet --allow-read --allow-env --config deno.json)
echo "== 2. the app side"
node "$HERE/import_review_client_check.cjs"
echo "== 3. the database"
"$HERE/run_import_approval_tests.sh"
echo "== 4. across the three layers"
DENO="$DENO" "$HERE/run_import_e2e.sh"
echo "== all booking-import checks passed"

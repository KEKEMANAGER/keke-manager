#!/usr/bin/env bash
# Builds 10_apply_bookings_kind_day_tour.sql: the migration, verbatim, between a
# "before" and an "after" check, in one transaction that commits only if every
# check passes. Run from anywhere: bash docs/day-tour-release/build.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
M="$HERE/../../supabase/migrations/20261104120000_bookings_kind_day_tour.sql"
MD5=$(md5sum "$M" | cut -c1-32)
OUT="$HERE/10_apply_bookings_kind_day_tour.sql"
{
cat <<EOF
-- KEKE day-tour fix - apply supabase/migrations/20261104120000_bookings_kind_day_tour.sql (md5 $MD5)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No booking is rewritten.
-- Built by docs/day-tour-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- the database is in the state this step expects
do \$state\$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_kind_check'))
     is distinct from 'CHECK ((kind = ANY (ARRAY[''transfer''::text, ''tour''::text, ''one_day_tour''::text])))' then
    raise exception 'day-tour fix (before): bookings_kind_check is not the rule this fix expects - stop';
  end if;
  if exists (select 1 from public.bookings where kind = 'day_tour') then raise exception 'day-tour fix (before): a booking is already stored as day_tour - stop'; end if;
end
\$state\$;

create temp table _before on commit drop as select count(*) as n, md5(string_agg(id::text || kind || coalesce(booking_type, ''), ',' order by id)) as h from public.bookings;

-- ===== supabase/migrations/20261104120000_bookings_kind_day_tour.sql, verbatim =====
EOF
cat "$M"
cat <<'EOF'
-- ===== end of the migration =====

-- the rule allows day tours, and no booking changed
do $after$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_kind_check'))
     is distinct from 'CHECK ((kind = ANY (ARRAY[''transfer''::text, ''tour''::text, ''day_tour''::text, ''one_day_tour''::text])))' then
    raise exception 'day-tour fix (after): the rule is not the expected one - stop';
  end if;
  if (select (n, h) from _before) is distinct from
     (select (count(*), md5(string_agg(id::text || kind || coalesce(booking_type, ''), ',' order by id))) from public.bookings) then
    raise exception 'day-tour fix (after): bookings changed - stop';
  end if;
end
$after$;

EOF
echo "insert into supabase_migrations.schema_migrations (version, name, statements, created_by)"
echo "values ('20261104120000', 'bookings_kind_day_tour', array['-- applied from supabase/migrations/20261104120000_bookings_kind_day_tour.sql (md5 $MD5) by the day-tour fix'], 'day-tour-fix');"
echo
echo "select 'day tours allowed' as result, now() as at;"
echo "commit;"
} > "$OUT"
echo "built $OUT"

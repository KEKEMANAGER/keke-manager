#!/usr/bin/env bash
# Builds 10_apply_import_approvals.sql: the migration, verbatim, between a
# "before" and an "after" check, in one transaction that commits only if every
# check passes. Run from anywhere: bash docs/import-release/build.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
M="$HERE/../../supabase/migrations/20261103200000_booking_import_approvals.sql"
MD5=$(md5sum "$M" | cut -c1-32)
OUT="$HERE/10_apply_import_approvals.sql"
{
cat <<EOF
-- KEKE import release - apply supabase/migrations/20261103200000_booking_import_approvals.sql (md5 $MD5)
-- Run as ONE call (Supabase SQL editor / MCP execute_sql). It commits only if every
-- check passes; otherwise it rolls back and nothing changes.
-- Built by docs/import-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- the database is in the state this step expects
do \$state\$
begin
  if to_regclass('public.booking_import_approvals') is not null then raise exception 'import release (before): the approvals table already exists - stop'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'import_approval_id') then raise exception 'import release (before): bookings.import_approval_id already exists - stop'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_guard_ownership' and not tgisinternal) then raise exception 'import release (before): P0-6 is not in place - stop'; end if;
end
\$state\$;

-- ===== supabase/migrations/20261103200000_booking_import_approvals.sql, verbatim =====
EOF
cat "$M"
cat <<'EOF'
-- ===== end of the migration =====

-- everything is in place, and nothing else changed
do $after$
declare n int;
begin
  if to_regclass('public.booking_import_approvals') is null then raise exception 'import release (after): no approvals table - stop'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.booking_import_approvals'::regclass) then raise exception 'import release (after): row security is off on the approvals - stop'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_import_approvals') then raise exception 'import release (after): the approvals have a policy - stop'; end if;
  if has_table_privilege('authenticated', 'public.booking_import_approvals', 'select')
     or has_table_privilege('anon', 'public.booking_import_approvals', 'select') then raise exception 'import release (after): the apps can read the approvals - stop'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'import_approval_id') then raise exception 'import release (after): no bookings.import_approval_id - stop'; end if;
  select count(*) into n from pg_trigger where tgrelid = 'public.bookings'::regclass and not tgisinternal
    and tgname in ('bookings_verify_import_approval', 'bookings_keep_import_approval');
  if n <> 2 then raise exception 'import release (after): % of the 2 triggers - stop', n; end if;
  if exists (select 1 from public.bookings where import_approval_id is not null) then raise exception 'import release (after): a booking already carries an approval - stop'; end if;
end
$after$;

EOF
echo "insert into supabase_migrations.schema_migrations (version, name, statements, created_by)"
echo "values ('20261103200000', 'booking_import_approvals', array['-- applied from supabase/migrations/20261103200000_booking_import_approvals.sql (md5 $MD5) by the import release'], 'import-release');"
echo
echo "select 'import approvals applied' as result, now() as at;"
echo "commit;"
} > "$OUT"
echo "built $OUT"

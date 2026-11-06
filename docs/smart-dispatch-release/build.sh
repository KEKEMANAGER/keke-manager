#!/usr/bin/env bash
# Builds the smart-dispatch release files from the migration and its undo:
#   10_apply_smart_dispatch.sql  the migration, verbatim, between a "before"
#                                and an "after" check, in one transaction
#   91_undo_smart_dispatch.sql   the undo, verbatim, the same way
# Each commits only if every check passes; otherwise nothing changes.
# 90_smoke_smart_dispatch.sql is written by hand (throwaway accounts, rolled back).
# Run from anywhere: bash docs/smart-dispatch-release/build.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M="$ROOT/supabase/migrations/20261105120000_smart_dispatch.sql"
U="$ROOT/supabase/rollback/20261105120000_smart_dispatch_undo.sql"
MMD5=$(md5sum "$M" | cut -c1-32)
UMD5=$(md5sum "$U" | cut -c1-32)

# The seven functions the migration replaces: (signature, production's body md5, the migration's body md5).
# md5 of pg_proc.prosrc with CRs removed - the same fingerprint the migration's own preflight uses.
FNS="('booking_dispatch_candidates(uuid)', '7bb06d17d6b8afd4ccff7288681f4b37', 'b9d8c1960653ed1c46029a952db40672'),
    ('booking_dispatch_message(uuid)', 'dbc8c06cd4fd69dd8e2f9a5d6a73533b', 'da54840428afdcce7bec30d2e27545e0'),
    ('dispatch_new_booking_push(uuid,integer)', 'd15b7f374e7a6327f68c4fa3cfe40f2b', '0b9acc76701b7828c28ec493573c522d'),
    ('dispatch_new_booking(uuid,uuid[],uuid[])', 'e0dccd9abab51e775d34cebde8703e06', 'f04b21bd943fd54da458fe5ad70cdb04'),
    ('dispatch_due_second_waves()', '86d752ac81aac0e0aa13458b94aff48b', '6548a89985f4e889507ba12579a92f3c'),
    ('alert_undispatched_bookings()', '943fccc6858ca06edb4784b8ade90a36', '0b684932051f1d31d7a9f004305bec0e'),
    ('bookings_guard_ownership()', '1694bef7bfea20efebd27ddeae42eafa', 'f87a9e3d3ba070f93ad44f53f2fcd1a4')"
NEW_FNS="'capacity_tier_max_seats(text)', 'booking_dispatch_pool(uuid,boolean,uuid)', 'booking_start_label_ka(text)',
    'booking_dispatch_launch(uuid)', 'dispatch_due_third_waves()', 'driver_matching_open_jobs(uuid)'"

# The six functions the migration adds, with the migration's body md5 (same fingerprint).
NEW_FN_MD5="('capacity_tier_max_seats(text)', 'd7e073f4630fb7e70d2b2f77acc4be22'),
    ('booking_dispatch_pool(uuid,boolean,uuid)', 'cadf12a56cf79dfd58eceeeeb518cf83'),
    ('booking_start_label_ka(text)', 'ca2325c1509bc88173daa3876713e286'),
    ('booking_dispatch_launch(uuid)', '86792340bedd29da6d5e8fa0bd0b4b53'),
    ('dispatch_due_third_waves()', 'ff3b7353e168b34fcee09f80256cb093'),
    ('driver_matching_open_jobs(uuid)', 'bd3265456c63eee313073e64738ffdd3')"

# Rows of what the migration must not touch, and the dispatch cron jobs: taken at the
# start of the transaction and compared at the end (one snapshot: repeatable read).
SNAP="(select count(*) || ':' || md5(coalesce(string_agg(x.id::text || '/' || coalesce(x.status, '-') || '/' || coalesce(x.driver_id::text, '-')
         || '/' || coalesce(x.updated_at::text, '-') || '/' || coalesce(x.dispatch_alert_sent_at::text, '-'), ',' order by x.id), '')) from public.bookings x)
    || '|' || (select count(*) from public.dispatch_log)
    || '|' || (select count(*) from public.notifications)
    || '|' || (select count(*) from public.booking_driver_declines)
    || '|' || (select coalesce(string_agg(jobname || ' ' || schedule || ' ' || command || ' ' || active, '; ' order by jobname), '')
                 from cron.job where command ~* '(dispatch|alert_undispatched)')"

header() { # $1 title, $2 source, $3 md5
cat <<EOF
-- KEKE smart dispatch release - $1
-- Source: $2 (md5 $3)
-- Run as ONE call (Supabase SQL editor / MCP execute_sql). It commits only if every
-- check passes; otherwise it rolls back and nothing changes. No existing row is changed.
-- Built by docs/smart-dispatch-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

EOF
}

{
header "step 1: apply" "supabase/migrations/20261105120000_smart_dispatch.sql" "$MMD5"
cat <<EOF
do \$state\$
declare step text := 'smart dispatch (before)'; f record; got text;
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261105120000') then
    raise exception '%: already in the migration history - stop', step;
  end if;
  for f in select * from (values $FNS) v(sig, before_md5, after_md5) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.before_md5 then
      raise exception '%: public.% is not production''s of 2026-11-06 (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  if exists (select 1 from unnest(array[$NEW_FNS]) s where to_regprocedure('public.' || s) is not null)
     or exists (select 1 from information_schema.columns where table_schema = 'public'
                 and ((table_name = 'bookings' and column_name in ('dispatch_launched_at', 'dispatch_wave3_due_at', 'dispatch_wave3_sent_at'))
                   or (table_name = 'dispatch_log' and column_name in ('wave3_driver_ids', 'wave3_token_count')))) then
    raise exception '%: smart dispatch objects exist already - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$state\$;

create temp table _snap on commit drop as select $SNAP as h;

-- ===== supabase/migrations/20261105120000_smart_dispatch.sql, verbatim =====
EOF
cat "$M"
cat <<EOF
-- ===== end of the migration =====

do \$after\$
declare step text := 'smart dispatch (after)'; f record; got text; s text;
begin
  for f in select * from (values $FNS) v(sig, before_md5, after_md5) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.after_md5 then
      raise exception '%: public.% is not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  for f in select * from (values $NEW_FN_MD5) v(sig, after_md5) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.after_md5 then
      raise exception '%: public.% is missing or not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  -- rights: the apps may call only these two; nobody signed out may call any
  foreach s in array array[$NEW_FNS, 'booking_dispatch_candidates(uuid)', 'booking_dispatch_message(uuid)',
                           'dispatch_new_booking_push(uuid,integer)', 'dispatch_new_booking(uuid,uuid[],uuid[])',
                           'dispatch_due_second_waves()', 'alert_undispatched_bookings()', 'bookings_guard_ownership()'] loop
    if has_function_privilege('anon', ('public.' || s)::regprocedure, 'execute') then
      raise exception '%: signed-out callers may run public.% - stop', step, s;
    end if;
    if has_function_privilege('authenticated', ('public.' || s)::regprocedure, 'execute')
       is distinct from (s in ('dispatch_new_booking(uuid,uuid[],uuid[])', 'driver_matching_open_jobs(uuid)')) then
      raise exception '%: the apps'' right to run public.% is not as intended - stop', step, s;
    end if;
  end loop;
  if (select count(*) from information_schema.columns where table_schema = 'public'
        and ((table_name = 'bookings' and column_name in ('dispatch_launched_at', 'dispatch_wave3_due_at', 'dispatch_wave3_sent_at'))
          or (table_name = 'dispatch_log' and column_name in ('wave3_driver_ids', 'wave3_token_count')))) <> 5 then
    raise exception '%: the new columns are not all there - stop', step;
  end if;
  if (select h from _snap) is distinct from ($SNAP) then
    raise exception '%: rows or the dispatch cron jobs changed - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$after\$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261105120000', 'smart_dispatch', array['-- applied from supabase/migrations/20261105120000_smart_dispatch.sql (md5 $MMD5) by docs/smart-dispatch-release'], 'smart-dispatch-release');

select 'smart dispatch applied' as result, now() as at;
commit;
EOF
} > "$HERE/10_apply_smart_dispatch.sql"

{
header "undo" "supabase/rollback/20261105120000_smart_dispatch_undo.sql" "$UMD5"
cat <<EOF
do \$state\$
declare step text := 'undo smart dispatch (before)'; f record; got text;
begin
  for f in select * from (values $FNS) v(sig, before_md5, after_md5) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.after_md5 then
      raise exception '%: public.% is not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$state\$;

-- ===== supabase/rollback/20261105120000_smart_dispatch_undo.sql, verbatim =====
EOF
cat "$U"
cat <<EOF
-- ===== end of the undo =====

do \$after\$
declare step text := 'undo smart dispatch (after)'; f record; got text;
begin
  for f in select * from (values $FNS) v(sig, before_md5, after_md5) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.before_md5 then
      raise exception '%: public.% is not back to production''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  if exists (select 1 from unnest(array[$NEW_FNS]) s where to_regprocedure('public.' || s) is not null)
     or exists (select 1 from information_schema.columns where table_schema = 'public'
                 and ((table_name = 'bookings' and column_name in ('dispatch_launched_at', 'dispatch_wave3_due_at', 'dispatch_wave3_sent_at'))
                   or (table_name = 'dispatch_log' and column_name in ('wave3_driver_ids', 'wave3_token_count')))) then
    raise exception '%: smart dispatch objects are still there - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$after\$;

delete from supabase_migrations.schema_migrations where version = '20261105120000';

select 'smart dispatch undone' as result, now() as at;
commit;
EOF
} > "$HERE/91_undo_smart_dispatch.sql"

( cd "$HERE" && md5sum 10_apply_smart_dispatch.sql 90_smoke_smart_dispatch.sql 91_undo_smart_dispatch.sql > MD5SUMS.txt 2>/dev/null || true )
echo "built $HERE/10_apply_smart_dispatch.sql and 91_undo_smart_dispatch.sql"

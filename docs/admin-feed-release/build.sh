#!/usr/bin/env bash
# Builds the admin-feed release files from the migration and its undo:
#   10_apply_admin_feed.sql   the migration, verbatim, between a "before" and an
#                             "after" check, in one transaction
#   91_undo_admin_feed.sql    the undo, verbatim, the same way
# Each commits only if every check passes; otherwise nothing changes.
# 90_smoke_admin_feed.sql is written by hand (throwaway accounts, rolled back,
# nobody notified).
# Run from anywhere: bash docs/admin-feed-release/build.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
M="$ROOT/supabase/migrations/20261106150000_admin_booking_feed.sql"
U="$ROOT/supabase/rollback/20261106150000_admin_booking_feed_undo.sql"
MMD5=$(md5sum "$M" | cut -c1-32)
UMD5=$(md5sum "$U" | cut -c1-32)

# What the feed calls, as production has it on 2026-11-06 (md5 of pg_proc.prosrc
# with CRs removed). The migration changes none of them.
DEPS="('deliver_notification(uuid,text,text,text,jsonb,text)', 'cc3e7c5df5c30bcef205a9b018f6fd9d'),
    ('booking_notify(uuid,text,text,text,jsonb)', '6bfc41655ab690cd4a61c6a547559ec1'),
    ('booking_route_summary(text,text,text)', '1b830dc85c45cca1be96e87fe1b8bfca'),
    ('booking_start_label_ka(text)', 'ca2325c1509bc88173daa3876713e286'),
    ('send_expo_push(text,text,text,jsonb)', 'bbfb308ab95a208ed0a6c29a3f2f4b5d'),
    ('send_web_push(uuid,text,text,jsonb)', '9219d7481ab3af8c15b7a943bdf6742f'),
    ('fetch_user_push_token(uuid)', '1a9696a1d05d91d05150c853e474e976')"
# The two functions the migration adds, with its body md5 (same fingerprint).
NEW_FN_MD5="('admin_booking_feed_message(public.bookings,text,uuid)', 'c1235dff6ae92a30a340e4bcc3b95b2d'),
    ('bookings_admin_feed()', '301aa0311efa21024cbf95964768928e')"
NEW_FNS="'admin_booking_feed_message(public.bookings,text,uuid)', 'bookings_admin_feed()'"
TRG="CREATE TRIGGER bookings_admin_feed AFTER INSERT OR UPDATE OF status, driver_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION bookings_admin_feed()"
# The columns the feed reads.
COLS="('bookings','id'), ('bookings','company_id'), ('bookings','driver_id'), ('bookings','vehicle_id'), ('bookings','status'),
    ('bookings','is_group_master'), ('bookings','cancelled_by'), ('bookings','voucher_code'), ('bookings','from_location'),
    ('bookings','to_location'), ('bookings','route'), ('bookings','date_display'), ('bookings','vehicle_type'),
    ('bookings','vehicle_class'), ('bookings','requested_capacity_tier'), ('bookings','passengers'), ('bookings','price_gel'),
    ('bookings','driver_display_name'), ('bookings','driver_plate'), ('users','id'), ('users','role'), ('users','full_name'),
    ('users','company_name'), ('vehicles','id'), ('vehicles','driver_id'), ('vehicles','model'), ('vehicles','plate'),
    ('vehicles','type'), ('vehicles','verification_status'), ('vehicles','is_active')"

# Rows the migration must not touch, and the other triggers of bookings: taken at
# the start of the transaction and compared at the end (one snapshot: repeatable read).
SNAP="(select count(*) || ':' || md5(coalesce(string_agg(x.id::text || '/' || coalesce(x.status, '-') || '/' || coalesce(x.driver_id::text, '-')
         || '/' || coalesce(x.updated_at::text, '-'), ',' order by x.id), '')) from public.bookings x)
    || '|' || (select count(*) from public.notifications)
    || '|' || (select count(*) from public.push_outbox)
    || '|' || (select count(*) from public.users)
    || '|' || (select coalesce(string_agg(t.tgname || ' ' || t.tgenabled::text, ', ' order by t.tgname), '')
                 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal and t.tgname <> 'bookings_admin_feed')"

header() { # $1 title, $2 source, $3 md5
cat <<EOF
-- KEKE admin booking feed release - $1
-- Source: $2 (md5 $3)
-- Run as ONE call (Supabase SQL editor / MCP execute_sql). It commits only if every
-- check passes; otherwise it rolls back and nothing changes. No existing row is changed
-- and nobody is notified by running it.
-- Built by docs/admin-feed-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

EOF
}

deps_check() { # $1 step label
cat <<EOF
  for f in select * from (values $DEPS) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is not production''s of 2026-11-06 (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
EOF
}

{
header "step 1: apply" "supabase/migrations/20261106150000_admin_booking_feed.sql" "$MMD5"
cat <<EOF
do \$state\$
declare step text := 'admin feed (before)'; f record; got text;
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261106150000') then
    raise exception '%: already in the migration history - stop', step;
  end if;
$(deps_check)
  if exists (select 1 from unnest(array[$NEW_FNS]) s where to_regprocedure('public.' || s) is not null)
     or exists (select 1 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed') then
    raise exception '%: the admin feed exists already - stop', step;
  end if;
  for f in select * from (values $COLS) v(tbl, col) loop
    if not exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = f.tbl and c.column_name = f.col) then
      raise exception '%: public.%.% is missing - stop', step, f.tbl, f.col;
    end if;
  end loop;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$state\$;

create temp table _snap on commit drop as select $SNAP as h;

-- ===== supabase/migrations/20261106150000_admin_booking_feed.sql, verbatim =====
EOF
cat "$M"
cat <<EOF
-- ===== end of the migration =====

do \$after\$
declare step text := 'admin feed (after)'; f record; got text; s text;
begin
  for f in select * from (values $NEW_FN_MD5) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is missing or not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  select pg_get_triggerdef(t.oid) || ' / ' || t.tgenabled::text into got
    from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed';
  if got is distinct from '$TRG / O' then
    raise exception '%: the trigger is not as intended (found %) - stop', step, coalesce(got, 'nothing');
  end if;
  -- rights: neither the apps nor anyone signed out may run either function
  foreach s in array array[$NEW_FNS] loop
    if has_function_privilege('anon', ('public.' || s)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || s)::regprocedure, 'execute') then
      raise exception '%: the apps may run public.% - stop', step, s;
    end if;
  end loop;
$(deps_check)
  if (select h from _snap) is distinct from ($SNAP) then
    raise exception '%: rows or the other booking triggers changed - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$after\$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261106150000', 'admin_booking_feed', array['-- applied from supabase/migrations/20261106150000_admin_booking_feed.sql (md5 $MMD5) by docs/admin-feed-release'], 'admin-feed-release');

select 'admin booking feed applied' as result, now() as at,
       (select count(*) from public.users where role = 'admin') as admins_who_will_hear;
commit;
EOF
} > "$HERE/10_apply_admin_feed.sql"

{
header "undo" "supabase/rollback/20261106150000_admin_booking_feed_undo.sql" "$UMD5"
cat <<EOF
do \$state\$
declare step text := 'undo admin feed (before)'; f record; got text;
begin
  for f in select * from (values $NEW_FN_MD5) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$state\$;

create temp table _snap on commit drop as select $SNAP as h;

-- ===== supabase/rollback/20261106150000_admin_booking_feed_undo.sql, verbatim =====
EOF
cat "$U"
cat <<EOF
-- ===== end of the undo =====

do \$after\$
declare step text := 'undo admin feed (after)'; f record; got text;
begin
  if exists (select 1 from unnest(array[$NEW_FNS]) s where to_regprocedure('public.' || s) is not null)
     or exists (select 1 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed') then
    raise exception '%: the admin feed is still there - stop', step;
  end if;
$(deps_check)
  if (select h from _snap) is distinct from ($SNAP) then
    raise exception '%: rows or the other booking triggers changed - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
\$after\$;

delete from supabase_migrations.schema_migrations where version = '20261106150000';

select 'admin booking feed undone' as result, now() as at;
commit;
EOF
} > "$HERE/91_undo_admin_feed.sql"

( cd "$HERE" && md5sum 10_apply_admin_feed.sql 90_smoke_admin_feed.sql 91_undo_admin_feed.sql > MD5SUMS.txt 2>/dev/null || true )
echo "built $HERE/10_apply_admin_feed.sql and 91_undo_admin_feed.sql"

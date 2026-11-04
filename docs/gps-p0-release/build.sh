#!/usr/bin/env bash
# Builds the GPS P0 release files: each migration and each undo, verbatim,
# between "before" and "after" checks, in ONE transaction that commits only if
# every check passes. Run from anywhere: bash docs/gps-p0-release/build.sh
#   10_apply_gps_p0_1.sql  20_apply_gps_p0_2.sql  30_apply_gps_p0_3.sql
#   93_undo_gps_p0_3.sql   92_undo_gps_p0_2.sql   91_undo_gps_p0_1.sql
# The "before" values are production's, read on 2026-11-04 (GPS backup of that
# day): if production changed since, a file stops instead of applying.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
MIG="$HERE/../../supabase/migrations"; RB="$HERE/../../supabase/rollback"

ROWS_SQL="select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x)"

# production's four read rules before P0-1 (md5 of pg_policies.qual)
P1_ORIG="('driver_locations','driver_locations_company_booking_read','8ad9d669e756c76ed04f307c11ee41c1'),
    ('driver_locations','driver_locations_fleet_host_read','9c393869a27ca520d9d767924909296a'),
    ('driver_locations','driver_locations_admin_read','a8889e5322f8467f00a2b22b9827e4a1'),
    ('driver_location_trail','driver_location_trail_company_read','f5bdff939db84023dc2b17c2d07ab05a')"
TRAIL_CLEANUP_ORIG="delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';"
TRAIL_CLEANUP_NEW="delete from public.driver_location_trail where created_at < now() - interval ''30 days'';"
WATCH_ORIG_MD5=404c16209b42db87e6c4052a2091c143

P1_STATE_ORIG="  if (select count(*) from (values $P1_ORIG) v(t, p, h)
       join pg_policies q on q.schemaname = 'public' and q.tablename = v.t and q.policyname = v.p and md5(coalesce(q.qual, '')) = v.h) <> 4 then
    raise exception '%: the four read rules are not production''s of 2026-11-04 - stop', step;
  end if;"
P1_STATE_NEW="  if (select count(*) from pg_policies q where q.schemaname = 'public'
        and q.policyname in ('driver_locations_company_booking_read', 'driver_locations_admin_read', 'driver_location_trail_company_read')
        and q.qual like '%in_progress%') <> 3
     or not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.policyname = 'driver_locations_fleet_host_read'
                     and q.qual like '%gps_fleet_owner_sees%')
     or to_regprocedure('public.gps_fleet_owner_sees(uuid)') is null
     or to_regprocedure('public.gps_admin_open_access(uuid,text,integer)') is null
     or to_regprocedure('public.gps_admin_close_access(uuid)') is null
     or to_regclass('public.gps_admin_access') is null
     or not (select relrowsecurity from pg_class where oid = 'public.gps_admin_access'::regclass)
     or has_function_privilege('anon', 'public.gps_admin_open_access(uuid,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.gps_fleet_owner_sees(uuid)', 'execute')
     or has_table_privilege('anon', 'public.gps_admin_access', 'select')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'insert')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'update')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'delete') then
    raise exception '%: the P0-1 rules are not as expected - stop', step;
  end if;"
P2_STATE_ORIG="  if exists (select 1 from pg_trigger where not tgisinternal
               and tgrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass)
               and tgname <> 'driver_locations_20_server_time')
     or to_regclass('public.gps_device_clock') is not null
     or exists (select 1 from cron.job where jobname = 'gps-tidy-pins')
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from '$TRAIL_CLEANUP_ORIG' then
    raise exception '%: positions, road, clock table or jobs are not production''s of 2026-11-04 - stop', step;
  end if;"
P2_STATE_NEW="  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
        and tgname in ('driver_locations_10_trip_guard', 'driver_locations_15_device_clock', 'driver_location_trail_10_trip_points')) <> 3
     or to_regclass('public.gps_device_clock') is null
     or not (select relrowsecurity from pg_class where oid = 'public.gps_device_clock'::regclass)
     or has_table_privilege('authenticated', 'public.gps_device_clock', 'select')
     or has_table_privilege('anon', 'public.gps_device_clock', 'select')
     or exists (select 1 from unnest(array['public.gps_trip_accepts_point(uuid,uuid,timestamptz)', 'public.driver_location_trail_keep_trip_points()',
                                        'public.driver_locations_trip_guard()', 'public.driver_locations_device_clock()',
                                        'public.gps_tidy_pins(timestamptz)']) f, unnest(array['anon', 'authenticated']) r
                 where has_function_privilege(r, f, 'execute'))
     or (select schedule || ' ' || command from cron.job where jobname = 'gps-tidy-pins') is distinct from '*/5 * * * * select public.gps_tidy_pins();'
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from '$TRAIL_CLEANUP_NEW' then
    raise exception '%: the P0-2 objects are not as expected - stop', step;
  end if;"
P3_STATE_ORIG="  if to_regprocedure('public.watch_trip_gps()') is null
     or md5(pg_get_functiondef('public.watch_trip_gps()'::regprocedure)) <> '$WATCH_ORIG_MD5'
     or to_regprocedure('public.watch_trip_gps(timestamptz)') is not null
     or exists (select 1 from pg_trigger where tgname = 'driver_locations_20_server_time')
     or (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'trip_gps_watch')
        is distinct from 'driver_id,booking_id,quiet_since,silent_sent_at,silent_count,alert_sent_at,alert_count'
     or (select command from cron.job where jobname = 'watch-trip-gps') is distinct from 'select public.watch_trip_gps();' then
    raise exception '%: the GPS watch is not production''s of 2026-11-04 - stop', step;
  end if;"
P3_STATE_NEW="  if to_regprocedure('public.watch_trip_gps(timestamptz)') is null
     or to_regprocedure('public.watch_trip_gps()') is not null
     or has_function_privilege('anon', 'public.watch_trip_gps(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.watch_trip_gps(timestamptz)', 'execute')
     or not exists (select 1 from pg_trigger where tgname = 'driver_locations_20_server_time' and tgenabled = 'O')
     or (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'trip_gps_watch'
          and column_name in ('trip_seen_at', 'quiet_kind', 'trip_silent_total', 'trip_alert_total')) <> 4
     or (select command from cron.job where jobname = 'watch-trip-gps') is distinct from 'select public.watch_trip_gps();' then
    raise exception '%: the P0-3 objects are not as expected - stop', step;
  end if;"

wrap() { # $1 out, $2 title, $3 source file, $4 step name, $5 before, $6 after, $7 history sql, $8 result
  local md5; md5=$(md5sum "$3" | cut -c1-32)
  {
  cat <<EOF
-- KEKE GPS P0 - $2
-- Source: ${3#$HERE/../../} (md5 $md5)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No row is changed by this file.
-- Built by docs/gps-p0-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do \$state\$
declare step text := '$4 (before)';
begin
$5
end
\$state\$;

create temp table _rows on commit drop as $ROWS_SQL as h;

-- ===== ${3#$HERE/../../}, verbatim =====
EOF
  cat "$3"
  cat <<EOF
-- ===== end =====

do \$after\$
declare step text := '$4 (after)';
begin
$6
  if (select h from _rows) is distinct from ($ROWS_SQL) then
    raise exception '%: rows of the GPS tables changed - stop', step;
  end if;
end
\$after\$;

$7

select '$8' as result, now() as at;
commit;
EOF
  } > "$1"
}

hist_add() { echo "insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('$1', '$2', array['-- applied from supabase/migrations/$1_$2.sql by docs/gps-p0-release'], 'gps-p0-release');"; }
hist_del() { echo "delete from supabase_migrations.schema_migrations where version = '$1' and name = '$2';"; }

wrap "$HERE/10_apply_gps_p0_1.sql" "step 1 of 3: P0-1, who sees a driver" "$MIG/20261104150000_gps_position_only_during_trip.sql" \
  "GPS P0-1" "$P1_STATE_ORIG
  if to_regclass('public.gps_admin_access') is not null or to_regprocedure('public.gps_fleet_owner_sees(uuid)') is not null then
    raise exception '%: P0-1 objects exist already - stop', step;
  end if;" "$P1_STATE_NEW" "$(hist_add 20261104150000 gps_position_only_during_trip)" "GPS P0-1 applied"
wrap "$HERE/20_apply_gps_p0_2.sql" "step 2 of 3: P0-2, sharing stops after the trip; the server checks the phone's clock" \
  "$MIG/20261104150100_gps_stop_sharing_after_trip.sql" "GPS P0-2" "$P2_STATE_ORIG" "$P2_STATE_NEW" \
  "$(hist_add 20261104150100 gps_stop_sharing_after_trip)" "GPS P0-2 applied (the tidy job runs within 5 minutes)"
wrap "$HERE/30_apply_gps_p0_3.sql" "step 3 of 3: P0-3, the watch on every trip; positions carry the server's time" \
  "$MIG/20261104150200_gps_watch_every_trip.sql" "GPS P0-3" "$P3_STATE_ORIG" "$P3_STATE_NEW" \
  "$(hist_add 20261104150200 gps_watch_every_trip)" "GPS P0-3 applied"
wrap "$HERE/93_undo_gps_p0_3.sql" "UNDO P0-3 (undo files run newest first: 93, 92, 91)" "$RB/20261104150200_gps_watch_every_trip_undo.sql" \
  "undo GPS P0-3" "$P3_STATE_NEW" "$P3_STATE_ORIG" "$(hist_del 20261104150200 gps_watch_every_trip)" "GPS P0-3 undone"
wrap "$HERE/92_undo_gps_p0_2.sql" "UNDO P0-2" "$RB/20261104150100_gps_stop_sharing_after_trip_undo.sql" \
  "undo GPS P0-2" "$P2_STATE_NEW" "$P2_STATE_ORIG" "$(hist_del 20261104150100 gps_stop_sharing_after_trip)" "GPS P0-2 undone"
wrap "$HERE/91_undo_gps_p0_1.sql" "UNDO P0-1" "$RB/20261104150000_gps_position_only_during_trip_undo.sql" \
  "undo GPS P0-1" "$P1_STATE_NEW" "$P1_STATE_ORIG" "$(hist_del 20261104150000 gps_position_only_during_trip)" "GPS P0-1 undone"
echo "built: $(cd "$HERE" && ls [0-9]*.sql | tr '\n' ' ')"

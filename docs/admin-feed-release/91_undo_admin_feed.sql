-- KEKE admin booking feed release - undo
-- Source: supabase/rollback/20261106150000_admin_booking_feed_undo.sql (md5 327a4284aed425dbd8ca5278585f8d10)
-- Run as ONE call (Supabase SQL editor / MCP execute_sql). It commits only if every
-- check passes; otherwise it rolls back and nothing changes. No existing row is changed
-- and nobody is notified by running it.
-- Built by docs/admin-feed-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $state$
declare step text := 'undo admin feed (before)'; f record; got text;
begin
  for f in select * from (values ('admin_booking_feed_message(public.bookings,text,uuid)', '7af832544914b83ece178a51881a1539'),
    ('bookings_admin_feed()', '301aa0311efa21024cbf95964768928e')) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is not the migration''s (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
$state$;

create temp table _snap on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(x.id::text || '/' || coalesce(x.status, '-') || '/' || coalesce(x.driver_id::text, '-')
         || '/' || coalesce(x.updated_at::text, '-'), ',' order by x.id), '')) from public.bookings x)
    || '|' || (select count(*) from public.notifications)
    || '|' || (select count(*) from public.push_outbox)
    || '|' || (select count(*) from public.users)
    || '|' || (select coalesce(string_agg(t.tgname || ' ' || t.tgenabled::text, ', ' order by t.tgname), '')
                 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal and t.tgname <> 'bookings_admin_feed') as h;

-- ===== supabase/rollback/20261106150000_admin_booking_feed_undo.sql, verbatim =====
-- Undo 20261106150000_admin_booking_feed.sql: the admins stop hearing about
-- every booking. The notifications already sent stay (they are the admins'
-- own inbox). Run it as one transaction. It can be run again.
drop trigger if exists bookings_admin_feed on public.bookings;
drop function if exists public.bookings_admin_feed();
drop function if exists public.admin_booking_feed_message(public.bookings, text, uuid);
-- ===== end of the undo =====

do $after$
declare step text := 'undo admin feed (after)'; f record; got text;
begin
  if exists (select 1 from unnest(array['admin_booking_feed_message(public.bookings,text,uuid)', 'bookings_admin_feed()']) s where to_regprocedure('public.' || s) is not null)
     or exists (select 1 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and t.tgname = 'bookings_admin_feed') then
    raise exception '%: the admin feed is still there - stop', step;
  end if;
  for f in select * from (values ('deliver_notification(uuid,text,text,text,jsonb,text)', 'cc3e7c5df5c30bcef205a9b018f6fd9d'),
    ('booking_notify(uuid,text,text,text,jsonb)', '6bfc41655ab690cd4a61c6a547559ec1'),
    ('booking_route_summary(text,text,text)', '1b830dc85c45cca1be96e87fe1b8bfca'),
    ('booking_start_label_ka(text)', 'ca2325c1509bc88173daa3876713e286'),
    ('send_expo_push(text,text,text,jsonb)', 'bbfb308ab95a208ed0a6c29a3f2f4b5d'),
    ('send_web_push(uuid,text,text,jsonb)', '9219d7481ab3af8c15b7a943bdf6742f'),
    ('fetch_user_push_token(uuid)', '1a9696a1d05d91d05150c853e474e976')) v(sig, want) loop
    select md5(replace(p.prosrc, E'\r', '')) into got from pg_proc p where p.oid = to_regprocedure('public.' || f.sig);
    if got is distinct from f.want then
      raise exception '%: public.% is not production''s of 2026-11-06 (found %) - stop', step, f.sig, coalesce(got, 'nothing');
    end if;
  end loop;
  if (select h from _snap) is distinct from ((select count(*) || ':' || md5(coalesce(string_agg(x.id::text || '/' || coalesce(x.status, '-') || '/' || coalesce(x.driver_id::text, '-')
         || '/' || coalesce(x.updated_at::text, '-'), ',' order by x.id), '')) from public.bookings x)
    || '|' || (select count(*) from public.notifications)
    || '|' || (select count(*) from public.push_outbox)
    || '|' || (select count(*) from public.users)
    || '|' || (select coalesce(string_agg(t.tgname || ' ' || t.tgenabled::text, ', ' order by t.tgname), '')
                 from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal and t.tgname <> 'bookings_admin_feed')) then
    raise exception '%: rows or the other booking triggers changed - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
$after$;

delete from supabase_migrations.schema_migrations where version = '20261106150000';

select 'admin booking feed undone' as result, now() as at;
commit;

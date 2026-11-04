-- KEKE day-tour fix - apply supabase/migrations/20261104120000_bookings_kind_day_tour.sql (md5 4344e096573fd475d5970f1d11c1b56e)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No booking is rewritten.
-- Built by docs/day-tour-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- the database is in the state this step expects
do $state$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_kind_check'))
     is distinct from 'CHECK ((kind = ANY (ARRAY[''transfer''::text, ''tour''::text, ''one_day_tour''::text])))' then
    raise exception 'day-tour fix (before): bookings_kind_check is not the rule this fix expects - stop';
  end if;
  if exists (select 1 from public.bookings where kind = 'day_tour') then raise exception 'day-tour fix (before): a booking is already stored as day_tour - stop'; end if;
end
$state$;

create temp table _before on commit drop as select count(*) as n, md5(string_agg(id::text || kind || coalesce(booking_type, ''), ',' order by id)) as h from public.bookings;

-- ===== supabase/migrations/20261104120000_bookings_kind_day_tour.sql, verbatim =====
-- A day tour is stored as a day tour.
--
-- Production's bookings_kind_check allows 'transfer', 'tour' and 'one_day_tour',
-- but nothing writes 'one_day_tour': the apps, the website, the edge functions
-- (booking-import, booking-emails, booking-reminders, price-quote) and the
-- database functions (booking_busy_window, booking_dispatch_message,
-- booking_type_label_ka, dispatch_new_booking_push) all write and read
-- 'day_tour' — as 20260529120000_bookings_kind_check.sql intended. So the
-- database refused every day tour, and the app's insertBooking retried it as
-- kind 'tour', booking_type 'tour': the booking was created, but as a
-- multi-day tour ("ტური" in labels, the history filter, the drivers' new-job
-- message), not a day tour.
--
-- The rule now also allows 'day_tour'. 'one_day_tour' stays allowed (no row
-- uses it, nothing breaks by keeping it). Only the allowed set grows, so every
-- existing booking passes the check unchanged; no booking is rewritten.
--
-- Rollback: supabase/rollback/20261104120000_bookings_kind_day_tour_undo.sql

alter table public.bookings drop constraint if exists bookings_kind_check;
alter table public.bookings
  add constraint bookings_kind_check
  check (kind = any (array['transfer'::text, 'tour'::text, 'day_tour'::text, 'one_day_tour'::text]));
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

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261104120000', 'bookings_kind_day_tour', array['-- applied from supabase/migrations/20261104120000_bookings_kind_day_tour.sql (md5 4344e096573fd475d5970f1d11c1b56e) by the day-tour fix'], 'day-tour-fix');

select 'day tours allowed' as result, now() as at;
commit;

-- Undo 20261104120000_bookings_kind_day_tour.sql: the rule allows 'transfer',
-- 'tour' and 'one_day_tour' again, exactly as production had it before.
--
-- A booking created as a day tour while the fix was live keeps kind
-- 'day_tour'. The narrow rule would refuse every later change to such a
-- booking (a driver accepting it, its status moving on), so this undo stops
-- and changes nothing while any exists. Turning those bookings into
-- kind 'tour' / booking_type 'tour' (how they were stored before the fix) is a
-- change to real bookings: a person decides it, then runs this file again.
--
--   select id, voucher_code, created_at from public.bookings where kind = 'day_tour';

do $$
declare n int;
begin
  select count(*) into n from public.bookings where kind = 'day_tour';
  if n > 0 then
    raise exception 'undo 20261104120000: % booking(s) are stored as day_tour - nothing changed; decide what they become first', n;
  end if;
end
$$;

alter table public.bookings drop constraint if exists bookings_kind_check;
alter table public.bookings
  add constraint bookings_kind_check
  check (kind = any (array['transfer'::text, 'tour'::text, 'one_day_tour'::text]));

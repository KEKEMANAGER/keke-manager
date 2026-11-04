-- KEKE import release - apply supabase/migrations/20261103200000_booking_import_approvals.sql (md5 41fdf6b83517ec39b95de487b0bdd083)
-- Run as ONE call (Supabase SQL editor / MCP execute_sql). It commits only if every
-- check passes; otherwise it rolls back and nothing changes.
-- Built by docs/import-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- the database is in the state this step expects
do $state$
begin
  if to_regclass('public.booking_import_approvals') is not null then raise exception 'import release (before): the approvals table already exists - stop'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'import_approval_id') then raise exception 'import release (before): bookings.import_approval_id already exists - stop'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass and tgname = 'bookings_guard_ownership' and not tgisinternal) then raise exception 'import release (before): P0-6 is not in place - stop'; end if;
end
$state$;

-- ===== supabase/migrations/20261103200000_booking_import_approvals.sql, verbatim =====
-- An imported booking is created only with the values the server approved.
--
-- The booking-import function reads a request into a draft and reviews its
-- critical values (date, time, places, passengers, vehicle, price, flight).
-- Before the agency creates the booking, the app sends the final draft back
-- to the function (action "approve"); the function checks it again on the
-- server — every value that was not confirmed when the request was read must
-- have been confirmed or corrected by a person — and writes down exactly the
-- values it approved here, with the service role.
--
-- The app then inserts the booking with import_approval_id. This trigger lets
-- that booking in only when the approval exists, belongs to the same company,
-- is unused and fresh, and the booking carries exactly the approved values.
-- A booking without import_approval_id — every booking typed into the form —
-- is not touched: the manual form works exactly as before.
--
-- One reviewed service gets one approval (review_key, the fingerprint of its
-- review token): "Create" pressed twice, or a request sent again after a lost
-- answer, finds the same approval, and once that approval has made a booking
-- the function answers with that booking instead of approving a second one.
--
-- Rollback: supabase/rollback/20261103200000_booking_import_approvals_undo.sql

create table if not exists public.booking_import_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references auth.users (id) on delete cascade,
  /** The critical columns of the booking about to be inserted, as approved. No guest name or phone. */
  approved jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  used_at timestamptz,
  used_booking_id uuid,
  /** SHA-256 of the review token the approval was given for (never the token itself). */
  review_key text
);

alter table public.booking_import_approvals add column if not exists review_key text;

comment on table public.booking_import_approvals is
  'Server approvals for bookings created from an imported request (booking-import, action approve). Written only by the service role; checked by bookings_verify_import_approval.';

create index if not exists booking_import_approvals_company_idx
  on public.booking_import_approvals (company_id, created_at desc);

create unique index if not exists booking_import_approvals_review_key
  on public.booking_import_approvals (review_key) where review_key is not null;

-- With RLS on and no policy, only the service role (the import function) reads or writes it.
alter table public.booking_import_approvals enable row level security;
revoke all on table public.booking_import_approvals from anon, authenticated;
grant select, insert, update on table public.booking_import_approvals to service_role;

alter table public.bookings
  add column if not exists import_approval_id uuid
  references public.booking_import_approvals (id) on delete set null;

comment on column public.bookings.import_approval_id is
  'Set when the booking was created from an imported request: the server approval its critical values were checked against.';

create or replace function public.bookings_verify_import_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  a public.booking_import_approvals%rowtype;
  v jsonb;
  bad text[] := '{}';
  flight_new text;
  flight_ok text;
  day_dates jsonb;
begin
  -- A booking typed into the form carries no approval: nothing to check.
  if new.import_approval_id is null then
    return new;
  end if;

  select * into a from public.booking_import_approvals where id = new.import_approval_id for update;
  if not found then
    raise exception 'bookings: import approval not found' using errcode = '42501';
  end if;
  if a.company_id is distinct from new.company_id then
    raise exception 'bookings: this import approval belongs to another company' using errcode = '42501';
  end if;
  if a.used_at is not null then
    raise exception 'bookings: this import approval was already used' using errcode = '42501';
  end if;
  if a.expires_at < now() then
    raise exception 'bookings: this import approval has expired — approve the booking again' using errcode = '42501';
  end if;

  v := a.approved;
  if new.date_display is distinct from (v ->> 'date_display') then bad := array_append(bad, 'date_display'); end if;
  if new.pickup_time is distinct from (v ->> 'pickup_time') then bad := array_append(bad, 'pickup_time'); end if;
  if new.passengers is distinct from (v ->> 'passengers')::integer then bad := array_append(bad, 'passengers'); end if;
  if lower(new.vehicle_type) is distinct from lower(v ->> 'vehicle_type') then bad := array_append(bad, 'vehicle_type'); end if;
  if new.price_gel is distinct from (v ->> 'price_gel')::numeric then bad := array_append(bad, 'price_gel'); end if;
  if new.client_price is distinct from (v ->> 'client_price')::numeric then bad := array_append(bad, 'client_price'); end if;
  flight_new := nullif(regexp_replace(upper(coalesce(new.flight_number, '')), '[[:space:]-]+', '', 'g'), '');
  flight_ok := nullif(regexp_replace(upper(coalesce(v ->> 'flight_number', '')), '[[:space:]-]+', '', 'g'), '');
  if flight_new is distinct from flight_ok then bad := array_append(bad, 'flight_number'); end if;
  if new.from_location is distinct from (v ->> 'from_location') then bad := array_append(bad, 'from_location'); end if;
  if new.to_location is distinct from (v ->> 'to_location') then bad := array_append(bad, 'to_location'); end if;
  if (new.transfer_in ->> 'date') is distinct from (v ->> 'transfer_in_date') then bad := array_append(bad, 'transfer_in'); end if;
  if (new.transfer_out ->> 'date') is distinct from (v ->> 'transfer_out_date') then bad := array_append(bad, 'transfer_out'); end if;
  if jsonb_typeof(v -> 'tour_day_dates') = 'array' or jsonb_typeof(new.tour_days) = 'array' then
    select coalesce(jsonb_agg(coalesce(d ->> 'date', '')), '[]'::jsonb) into day_dates
      from jsonb_array_elements(case when jsonb_typeof(new.tour_days) = 'array' then new.tour_days else '[]'::jsonb end) d;
    if day_dates is distinct from coalesce(v -> 'tour_day_dates', '[]'::jsonb) then bad := array_append(bad, 'tour_days'); end if;
  end if;

  if array_length(bad, 1) > 0 then
    raise exception 'bookings: not the values that were approved (%) — approve the booking again', array_to_string(bad, ', ')
      using errcode = '42501';
  end if;

  update public.booking_import_approvals set used_at = now(), used_booking_id = new.id where id = a.id;
  return new;
end;
$fn$;

revoke all on function public.bookings_verify_import_approval() from public, anon, authenticated;

-- The link says which approval created the booking; a client does not rewrite
-- it later. An AFTER trigger (an error there undoes the update just the same),
-- so the order of the P0 BEFORE-UPDATE guards is left exactly as it was; and
-- invoker-rights, because inside the definer-rights function above
-- current_user is the owner, not the caller.
create or replace function public.bookings_keep_import_approval()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.import_approval_id is distinct from old.import_approval_id
     and current_user in ('authenticated', 'anon') then
    raise exception 'bookings: import_approval_id is set only when the booking is created' using errcode = '42501';
  end if;
  return null;
end;
$fn$;

drop trigger if exists bookings_verify_import_approval on public.bookings;
create trigger bookings_verify_import_approval
  before insert on public.bookings
  for each row execute function public.bookings_verify_import_approval();

drop trigger if exists bookings_keep_import_approval on public.bookings;
create trigger bookings_keep_import_approval
  after update of import_approval_id on public.bookings
  for each row execute function public.bookings_keep_import_approval();
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

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261103200000', 'booking_import_approvals', array['-- applied from supabase/migrations/20261103200000_booking_import_approvals.sql (md5 41fdf6b83517ec39b95de487b0bdd083) by the import release'], 'import-release');

select 'import approvals applied' as result, now() as at;
commit;

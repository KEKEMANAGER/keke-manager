-- Two logs the admin panel had no way to show, because nothing was recorded.
--
-- 1. dispatch_log — who a booking was actually pushed to, and in which wave.
--    Until now "why did this driver not get it?" could only be answered by
--    re-deriving the wave logic in your head.
-- 2. booking_import_log — every company file that went through the importer,
--    whether it parsed, and what went wrong when it did not. The upload that
--    silently produced no booking is the bug report; this is where it lands.

create table if not exists public.dispatch_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  booking_id uuid references public.bookings(id) on delete cascade,
  company_id uuid references public.users(id) on delete set null,
  regions text[] not null default '{}',
  from_location text,
  to_location text,
  wave1_driver_ids uuid[] not null default '{}',
  wave2_driver_ids uuid[] not null default '{}',
  wave1_token_count int not null default 0,
  wave2_token_count int not null default 0,
  wave1_sent int not null default 0,
  wave1_failed int not null default 0
);

create index if not exists dispatch_log_created_at_idx
  on public.dispatch_log (created_at desc);
create index if not exists dispatch_log_booking_idx
  on public.dispatch_log (booking_id);

alter table public.dispatch_log enable row level security;

drop policy if exists dispatch_log_admin_select on public.dispatch_log;
create policy dispatch_log_admin_select on public.dispatch_log
  for select using (public.is_admin_user());

-- No insert policy on purpose: rows arrive only through log_dispatch(), which
-- authorizes the caller against the booking itself.

create or replace function public.log_dispatch(
  p_booking_id uuid,
  p_regions text[] default '{}',
  p_from_location text default null,
  p_to_location text default null,
  p_wave1_driver_ids uuid[] default '{}',
  p_wave2_driver_ids uuid[] default '{}',
  p_wave1_token_count int default 0,
  p_wave2_token_count int default 0,
  p_wave1_sent int default 0,
  p_wave1_failed int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid;
  v_allowed boolean := false;
  v_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  -- Only the company whose booking this is may record its dispatch, or an
  -- admin. Definer rights plus no check would make this function a way for
  -- any signed-in user to write whatever they liked into the admin's dispatch
  -- log, which the panel then shows as fact.
  select b.company_id, (b.company_id = auth.uid() or public.is_admin_user())
    into v_company, v_allowed
  from public.bookings b
  where b.id = p_booking_id;

  if not coalesce(v_allowed, false) then
    return null;
  end if;

  insert into public.dispatch_log (
    booking_id, company_id, regions, from_location, to_location,
    wave1_driver_ids, wave2_driver_ids,
    wave1_token_count, wave2_token_count, wave1_sent, wave1_failed
  )
  values (
    p_booking_id, v_company, coalesce(p_regions, '{}'), p_from_location, p_to_location,
    coalesce(p_wave1_driver_ids, '{}'), coalesce(p_wave2_driver_ids, '{}'),
    coalesce(p_wave1_token_count, 0), coalesce(p_wave2_token_count, 0),
    coalesce(p_wave1_sent, 0), coalesce(p_wave1_failed, 0)
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.log_dispatch is
  'Records one booking dispatch (wave 1 + wave 2 recipients) for the admin dispatch log.';

grant execute on function public.log_dispatch(
  uuid, text[], text, text, uuid[], uuid[], int, int, int, int
) to authenticated;

create table if not exists public.booking_import_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid references public.users(id) on delete set null,
  file_name text,
  file_bytes int,
  -- 'ok' when a draft came back, 'empty' when nothing could be read,
  -- 'error' when the file was refused.
  status text not null default 'ok',
  error text,
  used_ai boolean not null default false,
  service_count int not null default 1,
  warnings text[] not null default '{}',
  duration_ms int
);

create index if not exists booking_import_log_created_at_idx
  on public.booking_import_log (created_at desc);
create index if not exists booking_import_log_company_idx
  on public.booking_import_log (company_id, created_at desc);

alter table public.booking_import_log enable row level security;

drop policy if exists booking_import_log_admin_select on public.booking_import_log;
create policy booking_import_log_admin_select on public.booking_import_log
  for select using (public.is_admin_user());

drop policy if exists booking_import_log_own_select on public.booking_import_log;
create policy booking_import_log_own_select on public.booking_import_log
  for select using (company_id = auth.uid());

-- Written by the booking-import edge function with the service role, so there
-- is no client insert policy here either.

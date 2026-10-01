-- Automatic pricing was the wrong answer for this market: a tour operator's
-- price is negotiated per client, per season, per relationship, and a formula
-- that gets it wrong is worse than no price at all — it anchors the company on
-- a number nobody would accept. So the company asks, and a human answers in two
-- minutes from Telegram.
--
-- The id is a plain counter on purpose: it has to be short enough to type into
-- a Telegram reply ("/q 7 850").

create table if not exists public.price_requests (
  id               bigint generated always as identity primary key,
  company_id       uuid        not null references auth.users(id) on delete cascade,
  company_name     text,
  kind             text        not null default 'transfer',
  from_location    text,
  to_location      text,
  when_text        text,
  days             integer,
  passengers       integer,
  vehicle_type     text,
  vehicle_class    text,
  note             text,
  status           text        not null default 'new',
  quoted_price_gel numeric,
  quoted_note      text,
  quoted_at        timestamptz,
  created_at       timestamptz not null default now(),
  constraint price_requests_status_check check (status in ('new', 'quoted', 'declined'))
);

create index if not exists price_requests_company_idx
  on public.price_requests (company_id, created_at desc);

alter table public.price_requests enable row level security;

-- A company sees and creates its own requests. The answer is written by the
-- Telegram webhook with the service role, so there is no client update policy.
drop policy if exists price_requests_select on public.price_requests;
create policy price_requests_select on public.price_requests
  for select to authenticated
  using (company_id = auth.uid() or public.is_admin_user());

drop policy if exists price_requests_insert on public.price_requests;
create policy price_requests_insert on public.price_requests
  for insert to authenticated
  with check (company_id = auth.uid());

grant select, insert on public.price_requests to authenticated;

-- So the company's screen fills in the moment the answer arrives.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'price_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.price_requests';
  end if;
end
$$;

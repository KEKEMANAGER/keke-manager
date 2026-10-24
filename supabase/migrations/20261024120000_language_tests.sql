-- Voice language test for drivers (English / Russian).
-- One row per attempt; the recordings are kept as evidence so a level can be
-- re-checked by an admin. Everything here is additive: no existing object is
-- dropped or changed.

create table if not exists public.language_tests (
  id            uuid primary key default gen_random_uuid(),
  driver_id     uuid not null references public.users(id) on delete cascade,
  language      text not null check (language in ('en','ru')),
  attempt       integer not null default 1,
  status        text not null default 'recorded'
                check (status in ('recorded','grading','graded','failed')),
  questions     jsonb not null default '[]'::jsonb,
  audio_paths   text[] not null default '{}',
  duration_ms   integer,
  transcript    text,
  level         text check (level in ('A1','A2','B1','B2','C1','C2')),
  score         integer check (score between 0 and 100),
  ai_notes      text,
  ai_flags      jsonb,
  ai_model      text,
  graded_by     text check (graded_by in ('ai','admin')),
  admin_level   text check (admin_level in ('A1','A2','B1','B2','C1','C2')),
  admin_id      uuid references public.users(id) on delete set null,
  admin_note    text,
  error         text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  graded_at     timestamptz
);

create index if not exists language_tests_driver_idx
  on public.language_tests(driver_id, language, created_at desc);
create index if not exists language_tests_open_idx
  on public.language_tests(status) where status in ('recorded','grading','failed');

-- Invite links: a driver opens kekemanager.com/test?t=<token> from an SMS,
-- no password needed. The token only allows submitting recordings for that driver.
create table if not exists public.language_test_invites (
  token       text primary key,
  driver_id   uuid not null references public.users(id) on delete cascade,
  language    text check (language in ('en','ru')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  last_used_at timestamptz,
  uses        integer not null default 0
);

create index if not exists language_test_invites_driver_idx
  on public.language_test_invites(driver_id);

-- Current verified level per driver + language: newest graded attempt wins,
-- and an admin override beats the AI level.
create or replace view public.driver_language_levels as
select distinct on (t.driver_id, t.language)
  t.driver_id,
  t.language,
  coalesce(t.admin_level, t.level) as level,
  t.score,
  case when t.admin_level is not null then 'admin' else t.graded_by end as source,
  t.graded_at,
  t.id as test_id
from public.language_tests t
where t.status = 'graded' and coalesce(t.admin_level, t.level) is not null
order by t.driver_id, t.language, t.graded_at desc nulls last, t.created_at desc;

alter table public.language_tests        enable row level security;
alter table public.language_test_invites enable row level security;

-- Policies are created only when missing, so the file can be re-run safely.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='language_tests' and policyname='language_tests_own_read') then
    create policy language_tests_own_read on public.language_tests
      for select to authenticated using (driver_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='language_tests' and policyname='language_tests_admin_all') then
    create policy language_tests_admin_all on public.language_tests
      for all to authenticated
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='language_test_invites' and policyname='language_test_invites_admin_all') then
    create policy language_test_invites_admin_all on public.language_test_invites
      for all to authenticated
      using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end $$;

-- Private bucket for the recordings (only the edge function and admins read it).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('language-tests', 'language-tests', false, 10485760,
        array['audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='language_tests_admin_read') then
    create policy language_tests_admin_read on storage.objects
      for select to authenticated
      using (bucket_id = 'language-tests'
             and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
  end if;
end $$;

-- One invite per driver, created for every driver who does not have one yet.
insert into public.language_test_invites (token, driver_id)
select substr(md5(gen_random_uuid()::text), 1, 16), u.id
from public.users u
where u.role = 'driver'
  and coalesce(u.is_blocked, false) = false
  and not exists (select 1 from public.language_test_invites i where i.driver_id = u.id);

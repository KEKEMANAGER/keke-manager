-- Local stand-in for the parts of a Supabase project that the production
-- snapshot relies on: the API roles, auth.uid()/auth.role()/auth.jwt(),
-- auth.users, and pg_net's net.http_post (recorded, never sent).
--
-- FOR A THROWAWAY LOCAL TEST DATABASE ONLY. Never run this on a Supabase
-- project: it would replace Supabase's own auth and pg_net functions.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  -- PostgREST signs in as `authenticator` and switches to the caller's role,
  -- so in production session_user is 'authenticator' on every API request.
  -- tests.act_as() does the same, which matters for checks on session_user.
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator nologin noinherit;
  end if;
  if not pg_has_role('authenticator', 'authenticated', 'member') then
    grant anon, authenticated, service_role to authenticator;
  end if;
end
$$;

create schema if not exists auth;
create schema if not exists net;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Same definitions Supabase uses: the caller's identity comes from the JWT
-- claims PostgREST puts in request.jwt.claims.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- pg_net stand-in with the same signature: records the request.
create table if not exists net.http_calls (
  id bigserial primary key,
  url text,
  body jsonb,
  headers jsonb,
  called_at timestamptz not null default now()
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language plpgsql security definer as $$
declare
  v_id bigint;
begin
  insert into net.http_calls (url, body, headers) values (url, body, headers) returning id into v_id;
  return v_id;
end;
$$;

-- Storage stand-in: the objects table the Storage API checks policies on,
-- with Supabase's own storage.foldername() and the same table grants.
create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql immutable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

grant usage on schema public, auth, net, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant all on storage.objects to service_role;

-- Production keeps btree_gist in public (exclusion constraints on
-- driver_schedules) and one sequence-backed table.
create extension if not exists btree_gist with schema public;
create sequence if not exists public.web_push_subscriptions_id_seq;

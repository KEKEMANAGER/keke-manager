-- P0 release, step 0: a same-database snapshot taken right before the rollout.
--   * every table of schema public, copied with its data;
--   * _ddl: the definitions the rollout touches or could touch (functions,
--     triggers incl. auth/storage, policies incl. storage, indexes,
--     constraints, columns, views, table grants, cron jobs);
--   * _manifest: rows and md5 of the source and of the copy, per table.
-- Nothing in it is reachable through the API (no grants; schema not exposed).
-- Change the date in the schema name on the day it is taken (search/replace).
-- It complements Supabase's daily physical backup; it does not replace it.

create schema backup_p0_20261031;
comment on schema backup_p0_20261031 is
  'P0 release backup taken before any P0 change: every public table (data), _ddl (definitions), _manifest (rows and md5 per table). Not exposed to the API. Drop only with the founder''s approval once the rollout is stable.';

create table backup_p0_20261031._manifest (
  table_name  text primary key,
  source_rows bigint not null,
  source_md5  text not null,
  copy_rows   bigint not null,
  copy_md5    text not null,
  taken_at    timestamptz not null default now()
);

do $$
declare
  t record; sr bigint; sm text; cr bigint; cm text;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    execute format('create table backup_p0_20261031.%I as table public.%I', t.relname, t.relname);
    execute format($q$select count(*), md5(coalesce(string_agg(md5(x::text), '' order by md5(x::text)), '')) from public.%I x$q$, t.relname)
      into sr, sm;
    execute format($q$select count(*), md5(coalesce(string_agg(md5(x::text), '' order by md5(x::text)), '')) from backup_p0_20261031.%I x$q$, t.relname)
      into cr, cm;
    insert into backup_p0_20261031._manifest (table_name, source_rows, source_md5, copy_rows, copy_md5)
    values (t.relname, sr, sm, cr, cm);
  end loop;
end $$;

create table backup_p0_20261031._ddl as
select 'function'::text as kind, n.nspname::text as schema_name,
       p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_name,
       pg_get_functiondef(p.oid) as definition, p.proacl::text as extra
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind in ('f', 'p')
union all
select 'trigger', n.nspname::text, c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid), t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal and n.nspname in ('public', 'storage', 'auth')
union all
select 'policy', schemaname::text, tablename || '.' || policyname,
       format('as %s for %s to %s using (%s) with check (%s)', permissive, cmd, array_to_string(roles, ','), qual, with_check), null
  from pg_policies where schemaname in ('public', 'storage')
union all
select 'index', schemaname::text, tablename || '.' || indexname, indexdef, null
  from pg_indexes where schemaname = 'public'
union all
select 'constraint', n.nspname::text, c.relname || '.' || co.conname, pg_get_constraintdef(co.oid), co.contype::text
  from pg_constraint co join pg_class c on c.oid = co.conrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
union all
select 'column', table_schema::text, table_name || '.' || column_name,
       data_type || coalesce(' default ' || column_default, '') || case when is_nullable = 'NO' then ' not null' else '' end,
       ordinal_position::text
  from information_schema.columns where table_schema = 'public'
union all
select 'view', schemaname::text, viewname::text, definition, null from pg_views where schemaname = 'public'
union all
select 'table_acl', n.nspname::text, c.relname::text, c.relacl::text, 'rls=' || c.relrowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
union all
select 'cron_job', 'cron', jobname::text, schedule || ' | ' || command, active::text from cron.job;

revoke all on schema backup_p0_20261031 from public;
revoke all on all tables in schema backup_p0_20261031 from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema backup_p0_20261031 from anon, authenticated, service_role';
    execute 'revoke all on all tables in schema backup_p0_20261031 from anon, authenticated, service_role';
  end if;
end $$;

select count(*) as tables_copied,
       count(*) filter (where source_rows = copy_rows and source_md5 = copy_md5) as verified_equal,
       sum(copy_rows) as total_rows,
       (select count(*) from backup_p0_20261031._ddl) as definitions_saved,
       min(taken_at) as taken_at
  from backup_p0_20261031._manifest;

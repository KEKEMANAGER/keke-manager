-- KEKE P0 release - verify a backup snapshot (read-only apart from temporary
-- tables that disappear at the end of the transaction). Replace the date.
--  1. every copy still has the rows and md5 recorded when it was taken;
--  2. which live tables changed since (normal activity, for information);
--  3. no API role can reach the snapshot;
--  4. restore drill: every copy is inserted into a table shaped exactly like
--     today's live table (defaults, identity, generated columns, CHECK and
--     NOT NULL constraints, unique indexes) and must come out byte-identical.
begin;
create temp table _restore_drill (table_name text, restored_rows bigint, rows_ok boolean, md5_ok boolean, err text) on commit drop;
do $$
declare
  t record; cols text; n bigint; m text; tmp text;
begin
  for t in select table_name, copy_rows, copy_md5 from backup_p0_20261031._manifest order by 1 loop
    tmp := 'restore_' || t.table_name;
    begin
      execute format('create temp table %I (like public.%I including defaults including identity including generated including constraints including indexes) on commit drop', tmp, t.table_name);
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
        from pg_attribute a
       where a.attrelid = format('public.%I', t.table_name)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      execute format('insert into %I (%s) overriding system value select %s from backup_p0_20261031.%I', tmp, cols, cols, t.table_name);
      execute format($q$select count(*), md5(coalesce(string_agg(md5(x::text), '' order by md5(x::text)), '')) from %I x$q$, tmp) into n, m;
      insert into _restore_drill values (t.table_name, n, n = t.copy_rows, m = t.copy_md5, null);
    exception when others then
      insert into _restore_drill values (t.table_name, null, false, false, sqlerrm);
    end;
  end loop;
end $$;
with recheck as (
  select m.table_name, m.copy_md5, m.source_md5,
         (xpath('/row/c/text()', query_to_xml(format($q$select md5(coalesce(string_agg(md5(x::text), '' order by md5(x::text)), '')) as c from backup_p0_20261031.%I x$q$, m.table_name), false, true, '')))[1]::text as copy_md5_now
    from backup_p0_20261031._manifest m
)
select (select count(*) from recheck) as tables,
       (select count(*) from recheck where copy_md5_now = copy_md5) as copies_intact,
       (select count(*) from _restore_drill where rows_ok and md5_ok) as restore_drill_ok,
       (select string_agg(table_name || ': ' || coalesce(err, 'differs'), '; ') from _restore_drill where not (rows_ok and md5_ok)) as restore_problems,
       (has_schema_privilege('anon', 'backup_p0_20261031', 'usage') or has_schema_privilege('authenticated', 'backup_p0_20261031', 'usage')
        or has_schema_privilege('service_role', 'backup_p0_20261031', 'usage')) as api_can_reach_backup,
       (select min(taken_at) from backup_p0_20261031._manifest) as taken_at;
rollback;

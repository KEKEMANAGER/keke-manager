-- KEKE P0 release - put rows of ONE table back from a backup snapshot.
-- A template, not a script to run as is: an emergency tool for the case where
-- a step changed rows it should not have (the data guard makes this very
-- unlikely). Undo the phase first (rollback/), then restore the rows.
-- Replace TABLE, the snapshot date and the WHERE clause; review the preview
-- (part 1) before running part 2. Rows created after the snapshot are kept.

-- part 1: preview (read-only) - rows that differ from the snapshot
select 'changed since snapshot' as what, count(*)
  from public.TABLE l join backup_p0_20261031.TABLE s using (id)
 where row(l.*)::text is distinct from row(s.*)::text      -- same columns only
union all
select 'deleted since snapshot', count(*)
  from backup_p0_20261031.TABLE s
 where not exists (select 1 from public.TABLE l where l.id = s.id);

-- part 2: restore those rows (one transaction; triggers of this table are
-- switched off for the duration, so no notification or push is sent again)
begin;
set local lock_timeout = '5s';
alter table public.TABLE disable trigger user;
update public.TABLE l
   set (COLUMNS) = (select COLUMNS from backup_p0_20261031.TABLE s where s.id = l.id)
 where l.id in (select s.id from backup_p0_20261031.TABLE s join public.TABLE l2 using (id)
                 where row(l2.*)::text is distinct from row(s.*)::text)
   /* and WHERE */;
insert into public.TABLE select * from backup_p0_20261031.TABLE s
 where not exists (select 1 from public.TABLE l where l.id = s.id) /* and WHERE */;
alter table public.TABLE enable trigger user;
commit;

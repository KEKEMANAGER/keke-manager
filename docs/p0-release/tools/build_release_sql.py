#!/usr/bin/env python3
"""Builds the P0 production rollout SQL from the migration and undo files.

Every generated script runs as ONE transaction (repeatable read) and aborts by
itself, changing nothing, when:
  * a lock is not obtained within 5 s or a statement runs over 120 s;
  * the database is not in the state this step expects (earlier phases present,
    this one absent);
  * a function this step replaces or relies on is not exactly the version
    that was tested (md5 of its definition, Windows line endings ignored);
  * for a step that changes a table's RLS policies or triggers (P0-6:
    bookings), those policies and triggers are not exactly the rehearsed ones,
    before the step and after it (and after its undo);
  * any existing row of any public table changes, except where the step is
    meant to change it;
  * after the step, a function it created or replaced differs from the
    rehearsed result.
It records (or, for an undo, removes) the migration's own history row.

The expected fingerprints come from a rehearsal on a THROWAWAY local database
built from the production snapshots in supabase/tests/fixtures (PGHOST etc.
must point at a local server you can drop databases on). It never connects to
Supabase.

usage: build_release_sql.py <repo root> <output dir>
"""
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
DB = 'keke_p0_release_build'

PHASES = [
    dict(key='P0-1', slug='p0_1', file='supabase/migrations/20261031120000_driver_decline_per_driver.sql',
         undo='supabase/rollback/20261031120000_driver_decline_per_driver_undo.sql',
         version='20261031120000', name='driver_decline_per_driver',
         marker="to_regclass('public.booking_driver_declines') is not null",
         allowed=[], new_tables=['booking_driver_declines'], new_columns=[]),
    dict(key='P0-2', slug='p0_2', file='supabase/migrations/20261031150000_reminder_reassign_once.sql',
         undo='supabase/rollback/20261031150000_reminder_reassign_once_undo.sql',
         version='20261031150000', name='reminder_reassign_once',
         marker="exists (select 1 from information_schema.columns where table_schema = 'public' "
                "and table_name = 'bookings' and column_name = 'auto_reassigned_at')",
         allowed=[], new_tables=[], new_columns=[('bookings', 'auto_reassigned_at')]),
    dict(key='P0-3 A', slug='p0_3a', file='supabase/migrations/20261031180000_driver_eligibility.sql',
         undo='supabase/rollback/20261031180000_driver_eligibility_undo.sql',
         version='20261031180000', name='driver_eligibility',
         marker="exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                "where n.nspname = 'public' and p.proname = 'driver_can_take_jobs')",
         allowed=[], new_tables=[], new_columns=[]),
    dict(key='P0-4 A', slug='p0_4a', file='supabase/migrations/20261101090000_push_tokens_server_delivery.sql',
         undo='supabase/rollback/20261101090000_push_tokens_server_delivery_undo.sql',
         version='20261101090000', name='push_tokens_server_delivery',
         marker="to_regclass('public.push_tokens') is not null",
         # it hands unsent legacy "new booking" pushes to their recipient or
         # marks them done (0 such rows on 2026-10-31)
         allowed=['push_outbox'], new_tables=['push_tokens'], new_columns=[]),
    dict(key='P0-5', slug='p0_5', file='supabase/migrations/20261101120000_company_cancellation.sql',
         undo='supabase/rollback/20261101120000_company_cancellation_undo.sql',
         version='20261101120000', name='company_cancellation',
         marker="exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                "where n.nspname = 'public' and p.proname = 'cancel_booking_by_company')",
         allowed=[], new_tables=[], new_columns=[]),
    dict(key='P0-6', slug='p0_6', file='supabase/migrations/20261101150000_booking_ownership.sql',
         undo='supabase/rollback/20261101150000_booking_ownership_undo.sql',
         version='20261101150000', name='booking_ownership',
         marker="exists (select 1 from pg_trigger where tgrelid = 'public.bookings'::regclass "
                "and tgname = 'bookings_guard_ownership' and not tgisinternal)",
         allowed=[], new_tables=[], new_columns=[],
         # it replaces the UPDATE policies of bookings and adds a trigger there:
         # the policies and triggers of bookings must be exactly the rehearsed
         # ones before and after (and after its undo); and it relies on these
         # functions it does not replace
         tables=['bookings'], depends=['is_admin_user', 'driver_can_take_jobs', 'vehicle_usable_by_driver']),
]

FIXTURES = ['fixtures/supabase_shim.sql',
            'fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql',
            'fixtures/prod_reminders_snapshot_2026-10-31.sql',
            'fixtures/prod_p0_3_snapshot_2026-10-31.sql',
            'fixtures/prod_p0_4_snapshot_2026-10-31.sql']


def psql(*args, db=DB, capture=True):
    cmd = ['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, *args]
    r = subprocess.run(cmd, capture_output=capture, text=True)
    if r.returncode != 0:
        raise SystemExit(f'psql failed: {" ".join(args)[:200]}\n{r.stderr[-2000:]}')
    return r.stdout


def touched_functions(sql):
    return sorted(set(m.lower() for m in re.findall(
        r'create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)', sql, re.I)))


def fingerprints(names):
    """{identity signature: md5 of pg_get_functiondef without CR} for existing functions."""
    if not names:
        return {}
    arr = ','.join(names)
    out = psql('-At', '-F', '|', '-c',
               "select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', "
               "md5(replace(pg_get_functiondef(p.oid), E'\\r', '')) "
               "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
               f"where n.nspname = 'public' and p.prokind = 'f' and p.proname = any (string_to_array('{arr}', ',')) "
               "order by 1")
    return dict(line.split('|', 1) for line in out.strip().splitlines() if line)


POLICIES_MD5 = ("(select md5(coalesce(string_agg(pl.policyname || '|' || pl.permissive || '|' || pl.roles::text || '|' "
                "|| pl.cmd || '|' || coalesce(pl.qual, '') || '|' || coalesce(pl.with_check, ''), E'\\n' order by pl.policyname), '')) "
                "from pg_policies pl where pl.schemaname = 'public' and pl.tablename = {t})")
TRIGGERS_MD5 = ("(select md5(coalesce(string_agg(pg_get_triggerdef(tr.oid) || '|' || tr.tgenabled::text, E'\\n' order by tr.tgname), '')) "
                "from pg_trigger tr where tr.tgrelid = format('public.%I', {t})::regclass and not tr.tgisinternal)")


def table_fps(tables):
    """{table: (md5 of its RLS policies, md5 of its triggers)}"""
    out = {}
    for t in tables:
        lit = "'" + t + "'"
        r = psql('-At', '-F', '|', '-c', f"select {POLICIES_MD5.format(t=lit)}, {TRIGGERS_MD5.format(t=lit)}").strip()
        out[t] = tuple(r.split('|'))
    return out


def tbl_check(label, fps, when):
    if not fps:
        return ''
    values = ',\n    '.join(f"('{t}', '{pol}', '{trg}')" for t, (pol, trg) in sorted(fps.items()))
    return f"""-- {when}: the RLS policies and triggers of {', '.join(sorted(fps))} are exactly the rehearsed ones
do $tbl$
declare bad text;
begin
  select string_agg(x.t || x.what, '; ') into bad
    from (select e.t, case when {POLICIES_MD5.format(t='e.t')} is distinct from e.pol then ' (policies differ)' else '' end
                   || case when {TRIGGERS_MD5.format(t='e.t')} is distinct from e.trg then ' (triggers differ)' else '' end as what
            from (values
    {values}
            ) as e(t, pol, trg)) x
   where x.what <> '';
  if bad is not null then
    raise exception '{label}: not as rehearsed: % - nothing was applied', bad;
  end if;
end
$tbl$;
"""


def sql_list(items):
    return 'array[' + ', '.join("'" + i.replace("'", "''") + "'" for i in items) + ']::text[]' if items else "'{}'::text[]"


def fp_values(fp):
    return ',\n    '.join("('" + k.replace("'", "''") + "', '" + v + "')" for k, v in sorted(fp.items()))


def guard_pre(excluded_columns):
    excl = ' or '.join(f"(t.relname = '{t}' and a.attname = '{c}')" for t, c in excluded_columns) or 'false'
    return f"""-- data guard, part 1: every existing row of every public table, as this
-- transaction sees it (repeatable read: one snapshot for the whole step)
create temp table _p0_guard (table_name text primary key, cols text not null, n bigint not null, h text not null) on commit drop;
do $guard$
declare t record; c text; n bigint; h text;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind = 'r' order by 1
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into c
      from pg_attribute a
     where a.attrelid = format('public.%I', t.relname)::regclass and a.attnum > 0 and not a.attisdropped
       and not ({excl});
    execute format('select count(*), md5(coalesce(string_agg(md5(r::text), '''' order by md5(r::text)), '''')) from (select %s from public.%I) r', c, t.relname)
      into n, h;
    insert into _p0_guard values (t.relname, c, n, h);
  end loop;
end
$guard$;
"""


def guard_post(allowed, may_drop):
    return f"""-- data guard, part 2: nothing that existed before has changed
do $guard$
declare g record; n bigint; h text; changed text[] := '{{}}'; gone text[] := '{{}}';
begin
  for g in select * from _p0_guard order by 1 loop
    if to_regclass(format('public.%I', g.table_name)) is null then
      gone := gone || g.table_name;
      continue;
    end if;
    execute format('select count(*), md5(coalesce(string_agg(md5(r::text), '''' order by md5(r::text)), '''')) from (select %s from public.%I) r', g.cols, g.table_name)
      into n, h;
    if n <> g.n or h <> g.h then
      changed := changed || g.table_name;
    end if;
  end loop;
  if exists (select unnest(changed) except select unnest({sql_list(allowed)})) then
    raise exception 'P0 data guard: existing rows changed in % - the step is rolled back, nothing was applied', changed;
  end if;
  if exists (select unnest(gone) except select unnest({sql_list(may_drop)})) then
    raise exception 'P0 data guard: tables disappeared: % - the step is rolled back, nothing was applied', gone;
  end if;
end
$guard$;
"""


def fp_check(label, fp, when):
    if not fp:
        return f'-- ({when}: no existing function to fingerprint)\n'
    return f"""-- {when}: the functions are exactly the rehearsed versions
do $fp$
declare bad text;
begin
  select string_agg(e.fn || coalesce(' (found ' || a.h || ')', ' (missing)'), '; ') into bad
    from (values
    {fp_values(fp)}
    ) as e(fn, h)
    left join (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
             md5(replace(pg_get_functiondef(p.oid), E'\\r', '')) as h
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
    ) a on a.fn = e.fn
   where a.h is distinct from e.h;
  if bad is not null then
    raise exception '{label}: function not as rehearsed: % - nothing was applied', bad;
  end if;
end
$fp$;
"""


def state_check(label, present, absent):
    conds = []
    for p in present:
        conds.append(f"  if not ({p['marker']}) then raise exception '{label}: {p['key']} is not in place - stop'; end if;")
    for p in absent:
        conds.append(f"  if {p['marker']} then raise exception '{label}: {p['key']} is already in place - stop'; end if;")
    return "-- the database is in the state this step expects\ndo $state$\nbegin\n" + '\n'.join(conds) + "\nend\n$state$;\n"


def header(title, lines):
    return '-- ' + title + '\n' + ''.join('-- ' + l + '\n' for l in lines) + '\n'


def main():
    for v in ('PGHOST',):
        if not os.environ.get(v):
            raise SystemExit('set PGHOST/PGPORT/PGUSER for a local, disposable PostgreSQL')
    if any(s in os.environ['PGHOST'] for s in ('supabase', 'pooler')):
        raise SystemExit('refusing: PGHOST looks like a Supabase host')
    tests = ROOT / 'supabase' / 'tests'
    subprocess.run(['dropdb', '--if-exists', DB], check=True, capture_output=True)
    subprocess.run(['createdb', DB], check=True)
    os.chdir(tests)
    psql('-c', 'create extension if not exists pgtap', *sum((['-f', f] for f in FIXTURES), []))
    psql('-c', 'create schema if not exists supabase_migrations; '
               'create table if not exists supabase_migrations.schema_migrations '
               '(version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[])')

    texts = {p['key']: (ROOT / p['file']).read_text() for p in PHASES}
    undo_texts = {p['key']: (ROOT / p['undo']).read_text() for p in PHASES}
    all_names = sorted(set(sum((touched_functions(t) for t in texts.values()), [])
                           + sum((p.get('depends', []) for p in PHASES), [])))
    all_tables = sorted(set(sum((p.get('tables', []) for p in PHASES), [])))

    stages = [fingerprints(all_names)]           # stage 0 = production before P0
    tstages = [table_fps(all_tables)]
    for p in PHASES:
        psql('-f', str(ROOT / p['file']))
        stages.append(fingerprints(all_names))   # stage k = after phase k
        tstages.append(table_fps(all_tables))

    deploy_dir, undo_dir, check_dir = OUT / 'deploy', OUT / 'rollback', OUT / 'checks'
    for d in (deploy_dir, undo_dir, check_dir):
        d.mkdir(parents=True, exist_ok=True)

    manifest = []
    for k, p in enumerate(PHASES, start=1):
        text = texts[p['key']]
        md5 = hashlib.md5(text.encode()).hexdigest()
        names = touched_functions(text)
        deps = p.get('depends', [])
        tables = p.get('tables', [])
        before = {s: h for s, h in stages[k - 1].items() if s.split('(')[0] in names + deps}
        after = {s: h for s, h in stages[k].items() if s.split('(')[0] in names}
        t_before = {t: tstages[k - 1][t] for t in tables}
        t_after = {t: tstages[k][t] for t in tables}
        label = f"{p['key']} deploy"
        body = header(
            f"KEKE P0 release - {p['key']}: apply {p['file']} (md5 {md5})",
            ['Run as ONE call (Supabase SQL / MCP execute_sql). It commits only if every',
             'check passes; otherwise it rolls back and nothing changes.',
             'Generated by docs/p0-release/tools/build_release_sql.py - do not edit by hand.'])
        body += "begin isolation level repeatable read;\nset local lock_timeout = '5s';\nset local statement_timeout = '120s';\n\n"
        body += state_check(label, PHASES[:k - 1], PHASES[k - 1:]) + '\n'
        body += fp_check(label, before, 'before') + '\n'
        body += (tbl_check(label, t_before, 'before') + '\n') if tables else ''
        body += guard_pre([]) + '\n'
        body += f"-- ===== {p['file']} (verbatim) =====\n" + text.rstrip() + f"\n-- ===== end of {p['file']} =====\n\n"
        body += guard_post(p['allowed'], []) + '\n'
        body += fp_check(label, after, 'after') + '\n'
        body += (tbl_check(label, t_after, 'after') + '\n') if tables else ''
        body += state_check(label + ' (after)', PHASES[:k], PHASES[k:]) + '\n'
        body += (f"insert into supabase_migrations.schema_migrations (version, name, statements, created_by)\n"
                 f"values ('{p['version']}', '{p['name']}', array['-- applied from {p['file']} (md5 {md5}) by the P0 release runbook'], 'p0-release');\n\n")
        body += f"select '{p['key']} applied' as result, now() as at;\ncommit;\n"
        fname = deploy_dir / f"{k}0_deploy_{p['slug']}.sql"
        fname.write_text(body)

        # undo: from stage k back to stage k-1
        utext = undo_texts[p['key']]
        umd5 = hashlib.md5(utext.encode()).hexdigest()
        ulabel = f"{p['key']} undo"
        ub = header(
            f"KEKE P0 release - undo {p['key']}: apply {p['undo']} (md5 {umd5})",
            ['Run as ONE call. Rolls back by itself if a check fails. Undo in reverse order',
             '(P0-6 first). Rows written meanwhile in tables the phase created are dropped with them;',
             'every other existing row must stay exactly as it is.',
             'Generated by docs/p0-release/tools/build_release_sql.py - do not edit by hand.'])
        ub += "begin isolation level repeatable read;\nset local lock_timeout = '5s';\nset local statement_timeout = '120s';\n\n"
        ub += state_check(ulabel, PHASES[:k], PHASES[k:]) + '\n'
        ub += guard_pre(p['new_columns']) + '\n'
        ub += f"-- ===== {p['undo']} (verbatim) =====\n" + utext.rstrip() + f"\n-- ===== end of {p['undo']} =====\n\n"
        ub += guard_post(p['allowed'], p['new_tables']) + '\n'
        restored = {s: h for s, h in stages[k - 1].items() if s.split('(')[0] in names}
        ub += fp_check(ulabel, restored, 'after the undo') + '\n'
        ub += (tbl_check(ulabel, t_before, 'after the undo') + '\n') if tables else ''
        ub += state_check(ulabel + ' (after)', PHASES[:k - 1], PHASES[k - 1:]) + '\n'
        ub += f"delete from supabase_migrations.schema_migrations where version = '{p['version']}';\n\n"
        ub += f"select '{p['key']} undone' as result, now() as at;\ncommit;\n"
        (undo_dir / f"{k}0_undo_{p['slug']}.sql").write_text(ub)

        # read-only post-check for the step
        pc = header(f"KEKE P0 release - read-only check after {p['key']}", ['Changes nothing.'])
        pc += "begin isolation level repeatable read read only;\n"
        pc += state_check(f"{p['key']} check", PHASES[:k], PHASES[k:])
        pc += fp_check(f"{p['key']} check", {s: h for s, h in stages[k].items()}, 'all P0 functions')
        pc += tbl_check(f"{p['key']} check", t_after, 'after the step') if tables else ''
        pc += (f"select '{p['key']} is in place' as result,\n"
               f"       (select count(*) from supabase_migrations.schema_migrations where version = '{p['version']}') as history_row,\n"
               f"       (select count(*) from cron.job where active) as active_cron_jobs;\ncommit;\n")
        (check_dir / f"{k}0_check_{p['slug']}.sql").write_text(pc)
        manifest.append((p['key'], fname.name, md5, len(before), len(after)))

    # preflight before anything: production must be at stage 0
    pf = header('KEKE P0 release - read-only preflight before P0-1', ['Changes nothing.'])
    pf += "begin isolation level repeatable read read only;\n"
    pf += state_check('preflight', [], PHASES)
    pf += fp_check('preflight', stages[0], 'pre-P0 production functions')
    pf += tbl_check('preflight', tstages[0], 'pre-P0 production tables')
    pf += """select (select count(*) from public.push_outbox where sent_at is null) as unsent_pushes,
       (select count(*) from (select booking_id, user_id from public.push_outbox where user_id is not null
                              group by 1, 2 having count(*) > 1) d) as push_outbox_duplicates,
       (select count(*) from public.bookings where status = 'in_progress') as trips_in_progress,
       (select count(*) from public.bookings where status in ('accepted', 'pending')
           and date_display ~ '^\\d{4}-\\d{2}-\\d{2}T'
           and date_display::timestamptz between now() - interval '1 hour' and now() + interval '3 hours') as pickups_within_3h,
       (select count(*) from pg_stat_activity where state <> 'idle' and xact_start < now() - interval '1 minute'
           and pid <> pg_backend_pid()) as long_transactions,
       (select count(*) from cron.job where active) as active_cron_jobs;
commit;
"""
    (check_dir / '00_preflight.sql').write_text(pf)

    with open(OUT / 'fingerprints.txt', 'w') as f:
        for i, st in enumerate(stages):
            f.write(f'== stage {i} ({"production before P0" if i == 0 else "after " + PHASES[i - 1]["key"]})\n')
            for s, h in sorted(st.items()):
                f.write(f'{h}  {s}\n')
            for t, (pol, trg) in sorted(tstages[i].items()):
                f.write(f'{pol}  policies of {t}\n{trg}  triggers of {t}\n')
    for row in manifest:
        print('%-7s %-22s md5 %s  checks %d before / %d after' % row)
    subprocess.run(['dropdb', DB], check=True)


if __name__ == '__main__':
    main()

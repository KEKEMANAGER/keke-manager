# Production migration history vs. the repository (read-only investigation, 2026-10-31)

Source: `supabase_migrations.schema_migrations` of project `brrjuxgxmpgvkddcuaad`
(42 rows, newest `20261025154948`; saved in `prod_history_2026-10-31.txt`) compared
with the 162 files in `supabase/migrations` on the release branch.

| Group | Files | What it means |
|---|---:|---|
| Same version in history | 17 | applied the normal way |
| Same name, other version | 15 | applied through the dashboard / MCP, which stamps its own time |
| No history row, dated before 2026-09-23 | 111 | applied before the history was kept (it starts on 2026-09-23) |
| No history row, dated 2026-09-23 or later | 14 | 13 applied by hand without a row (checked object by object: push lock-down, web push, 27 Oct security lockdown, document helpers, KEKE Certified, GPS watch + cron, booking emails ×2, birth-date store, Delica models, agency outreach, welcome email). **One is not in production: `20261024120000_language_tests.sql`** (the driver language test, not switched on yet) |
| History rows with no file of that version or name | 9 | applied in production under other names (23 Oct dispatch tweaks etc.) |
| P0 files (not applied, by design) | 5 | this release |

Consequence: `supabase db push` compares versions only. It would try to apply
**130 files** (the 125 without a row plus the 5 P0 files), re-running months-old
migrations over the live schema — and it would also switch on the unapproved
language test. **It must not be used** until the history is repaired.

How P0 is applied instead: each P0 file is wrapped by
`tools/build_release_sql.py` into one guarded transaction (see RUNBOOK.md) that
also writes the file's own version and name into the history
(`20261031120000 driver_decline_per_driver` … `20261101120000 company_cancellation`),
so these five end up recorded exactly as in the repository.

Not needed for P0, recommended afterwards (separate approval, metadata only):
`supabase migration repair --status applied <version>` for the files verified
to be in production, so that `db push` becomes safe again.

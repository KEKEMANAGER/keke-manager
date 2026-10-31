# Database tests

These tests never connect to Supabase. They run on a throwaway local
PostgreSQL that is built from three fixtures:

| File | What it is |
|---|---|
| `fixtures/supabase_shim.sql` | Local stand-ins for Supabase's API roles (`anon`, `authenticated`, `service_role`), `auth.uid()` / `auth.role()` / `auth.jwt()`, `auth.users`, and pg_net's `net.http_post` (records calls, sends nothing). |
| `fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql` | Read-only snapshot of the production objects in the booking lifecycle: 11 tables with their constraints, indexes, RLS policies and grants, the 20 functions they call, and the triggers on `bookings` and `driver_schedules`. Schema only, no rows, no secrets. |
| `fixtures/p0_1_seed.sql` | Fake company, three drivers, their vehicles and test bookings, plus small helpers to act as a given user. |

The snapshot is a test fixture, not a migration and not the production
baseline. Once the production baseline migration exists, build the test
database from it instead.

## P0-1 — a driver's decline affects only that driver

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=<superuser> supabase/tests/run_p0_1_tests.sh
```

Needs PostgreSQL 15+ with pgTAP and btree_gist (Ubuntu: `postgresql-16`,
`postgresql-16-pgtap`). The script refuses hosts that look like Supabase.

It runs, in order:

1. `p0_1_bug_reproduction.sql` on the unpatched snapshot — shows the bug.
2. The migration `supabase/migrations/20261031120000_driver_decline_per_driver.sql`.
3. `p0_1_driver_decline.test.sql` — 52 pgTAP checks.
4. `p0_1_concurrency.sh` — real simultaneous sessions (accept vs accept,
   decline vs accept, duplicate declines), 20 rounds each, in a separate
   throwaway database.
5. The undo script `supabase/rollback/20261031120000_driver_decline_per_driver_undo.sql`
   (the bug comes back), then the migration again (it goes away).

Checks marked `# TODO` are known gaps that belong to other tasks and are
expected to fail today:

- P0-3: open jobs still expose passenger details to every driver.
- P0-3 / P1-1: a driver can still change an open booking he has not declined
  through a direct table update. `bookings_update_driver_accept` lets him match
  any open job, and Postgres ORs the `WITH CHECK` of every update policy, so
  the changed row passes through "Drivers update assigned bookings" (when he
  names himself as driver) or "Enable update for booking owners"
  (`WITH CHECK (true)`, when the update has no filter).

When those tasks land, the TODO checks should start passing; remove the
`todo()` lines then.

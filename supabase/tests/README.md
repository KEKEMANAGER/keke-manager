# Database tests

These tests never connect to Supabase. They run on a throwaway local
PostgreSQL that is built from three fixtures:

| File | What it is |
|---|---|
| `fixtures/supabase_shim.sql` | Local stand-ins for Supabase's API roles (`anon`, `authenticated`, `service_role`, and `authenticator`, the login PostgREST switches from — `tests.act_as()` does the same, so `session_user` is what it is in production), `auth.uid()` / `auth.role()` / `auth.jwt()`, `auth.users`, pg_net's `net.http_post` (records calls, sends nothing) and Storage's `storage.objects` / `storage.foldername()`. |
| `fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql` | Read-only snapshot of the production objects in the booking lifecycle: 11 tables with their constraints, indexes, RLS policies and grants, the 20 functions they call, and the triggers on `bookings` and `driver_schedules`. Schema only, no rows, no secrets. |
| `fixtures/p0_1_seed.sql` | Fake company, three drivers, their vehicles and test bookings, plus small helpers to act as a given user. |
| `fixtures/prod_reminders_snapshot_2026-10-31.sql` | Read-only snapshot of the production reminder and automatic-replacement functions (`run_booking_reminders`, `reassign_booking_to_driver`, `find_replacement_driver_for_booking`, `confirm_booking_as_driver` and their helpers), with their md5 at capture time. Load after the lifecycle snapshot. |
| `fixtures/p0_2_seed.sql` | Fake company, drivers and bookings for the reminder scenarios, a `tests.advance(n)` helper that makes n minutes go by, and a notification counter. |
| `fixtures/prod_p0_3_snapshot_2026-10-31.sql` | Read-only snapshot of the further production objects P0-3 touches: `booking_history` with its rules, the privileged-column guard on `users`, the two triggers on `vehicles`, the admin's car approve / reject functions and the four Storage rules of the bucket `booking-pickup-signs`. Load after the other two snapshots. |
| `fixtures/p0_3_seed.sql` | One account of every kind P0-3 is about (not approved, rejected, blocked, approved without a usable car, approved, fleet owner and driver, company, admin), open jobs and offers carrying passenger details, a taken job, an overlapping job, change-log rows, pickup-sign files and three replacement scenarios. |

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

On a database with P0-3 applied they pass, and they are no longer marked
TODO there: the two tampering checks from part A on, the passenger-details
check from part B on (`run_p0_3_tests.sh` runs this suite in both states).
Open-job visibility in this suite goes through `tests.sees_open_job()`, which
uses the server's `driver_open_jobs()` once P0-3 has deployed it and the table
before that; a "refused" direct write is an error or an UPDATE that matches no
row (`tests.refused()`), because from P0-3 on no rule lets a driver touch an
open job at all.

## P0-2 — the reminder worker replaces a driver at most once

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=<superuser> supabase/tests/run_p0_2_tests.sh
```

It runs, in order:

1. `p0_2_bug_reproduction.sql` on the unpatched snapshot — 7 BUG checks hold
   (three swaps in three runs, A → B → A → B; a trip in progress put back to
   accepted; no notice to the driver who loses the job; no alert when the
   3-hour escalation finds nobody; a refused swap deletes the current
   driver's calendar block).
2. The P0-1 and P0-2 migrations.
3. The same reproduction file — all 7 BUG checks now fail, as intended.
4. `p0_2_reminder_reassign.test.sql` (47 pgTAP checks), then the P0-1 suite on
   the same database.
5. `p0_2_concurrency.sh` (two reminder runs at once; a run against a driver's
   confirm) and the P0-1 races.
6. The P0-2 undo script (bugs back, P0-1 unaffected), then the migration again.

Inside one test transaction `now()` does not move: calling
`run_booking_reminders()` again stands for the next cron minute in the same
window, and `tests.advance(n)` shifts every stored time n minutes into the past.

## P0-3 — only approved drivers take jobs; before that, only a summary

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=<superuser> supabase/tests/run_p0_3_tests.sh
```

P0-3 comes in two parts: `supabase/migrations/20261031180000_driver_eligibility.sql`
(part A, safe with the app versions installed today) and
`supabase/staged/20261031180100_open_jobs_summary_only.sql` (part B, only after
the app update that reads open jobs through `driver_open_jobs()` is out). The
runner builds the database as P0-1 and P0-2 leave it and then runs, in order:

1. `p0_3_bug_reproduction.sql` — 22 BUG checks hold (who reads open jobs and
   offers in full, who can take a job and with which car, direct-UPDATE
   bypasses, self-approved cars, self-lifted blocks, pickup-sign listing, the
   replacement search picking a decliner or an unapproved car).
2. Part A: the reproduction again (only the three part-B items hold),
   `p0_3_driver_eligibility.test.sql` (115 pgTAP checks; the few that differ
   between the parts say so), then the P0-1 and P0-2 suites.
3. Part B: the reproduction (nothing holds), the P0-3, P0-1 and P0-2 suites.
4. `p0_3_concurrency.sh` (two drivers, one job; one driver, two overlapping
   jobs; a driver who is not approved against one who is; the company
   assigning while a driver accepts), then the P0-1 and P0-2 races.
5. Undo part B (part A's results again), undo part A (all 22 problems back,
   P0-1 and P0-2 still pass), then both parts again.


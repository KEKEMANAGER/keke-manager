# Database tests

These tests never connect to Supabase. They run on a throwaway local
PostgreSQL that is built from these fixtures:

| File | What it is |
|---|---|
| `fixtures/supabase_shim.sql` | Local stand-ins for Supabase's API roles (`anon`, `authenticated`, `service_role`, and `authenticator`, the login PostgREST switches from — `tests.act_as()` does the same, so `session_user` is what it is in production), `auth.uid()` / `auth.role()` / `auth.jwt()`, `auth.users`, pg_net's `net.http_post` (records calls, sends nothing) and Storage's `storage.objects` / `storage.foldername()`. |
| `fixtures/prod_booking_lifecycle_snapshot_2026-10-31.sql` | Read-only snapshot of the production objects in the booking lifecycle: 11 tables with their constraints, indexes, RLS policies and grants, the 20 functions they call, and the triggers on `bookings` and `driver_schedules`. Schema only, no rows, no secrets. |
| `fixtures/p0_1_seed.sql` | Fake company, three drivers, their vehicles and test bookings, plus small helpers to act as a given user. |
| `fixtures/prod_reminders_snapshot_2026-10-31.sql` | Read-only snapshot of the production reminder and automatic-replacement functions (`run_booking_reminders`, `reassign_booking_to_driver`, `find_replacement_driver_for_booking`, `confirm_booking_as_driver` and their helpers), with their md5 at capture time. Load after the lifecycle snapshot. |
| `fixtures/p0_2_seed.sql` | Fake company, drivers and bookings for the reminder scenarios, a `tests.advance(n)` helper that makes n minutes go by, and a notification counter. |
| `fixtures/prod_p0_3_snapshot_2026-10-31.sql` | Read-only snapshot of the further production objects P0-3 touches: `booking_history` with its rules, the privileged-column guard on `users`, the two triggers on `vehicles`, the admin's car approve / reject functions and the four Storage rules of the bucket `booking-pickup-signs`. Load after the other two snapshots. |
| `fixtures/p0_3_seed.sql` | One account of every kind P0-3 is about (not approved, rejected, blocked, approved without a usable car, approved, fleet owner and driver, company, admin), open jobs and offers carrying passenger details, a taken job, an overlapping job, change-log rows, pickup-sign files and three replacement scenarios. |
| `fixtures/prod_p0_4_snapshot_2026-10-31.sql` | Read-only snapshot of the production objects behind push notifications and new-booking dispatch: `messages`, `push_outbox` and `dispatch_log` with their rules and grants, the dispatch chain (`dispatch_new_booking_push` in both forms, the second wave, the one-minute fallback, `log_dispatch` and their helpers), `enqueue_booking_push`, `flush_push_outbox`, `create_user_notifications`, `user_may_notify`, `may_message_user`, and the triggers that touch push tokens. Load after the other three snapshots. |
| `fixtures/p0_4_seed.sql` | Companies, an admin, approved drivers, a blocked one, two KEKE has not approved, a fleet owner with his driver and a pending invitation, a hired driver, open / offered / taken / cancelled / finished bookings, chat messages, and a fake phone token for every account (`ExponentPushToken[p04-<name>]`). Helpers count what reached the shim's `net.http_post`. |
| `fixtures/p0_5_seed.sql` | Two companies, an admin, three approved drivers, a fleet owner with his driver, and C1's bookings in every state a cancellation meets: open, offered to one driver, accepted, given by a fleet owner to his driver, on the road, finished, cancelled, declined, another company's, and two convoys (one waiting, one with a car on the road). Helpers for the calendar, the change log and what reached `net.http_post`. |

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

## P0-4 — push tokens are the server's, and the server decides who is told

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=<superuser> supabase/tests/run_p0_4_tests.sh
```

P0-4 comes in two parts: `supabase/migrations/20261101090000_push_tokens_server_delivery.sql`
(part A, safe with the app versions installed today) and
`supabase/staged/20261101090100_push_tokens_private.sql` (part B, after the app
update that sends notifications through the server is out). Nothing is sent
anywhere: every push lands in the shim's `net.http_calls`. The runner builds
the database as P0-1..P0-3 part A leave it and then runs, in order:

1. `p0_4_bug_reproduction.sql` — 12 BUG checks hold (any signed-in account
   reads every token; any text to any phone through `enqueue_booking_push`;
   free in-app text from any company to any driver; the server's dispatch
   telling blocked, unapproved and declining drivers; an installed app's
   second wave reaching a blocked driver), and the double-dispatch race,
   counted (before P0-4 two dispatches of one booking tell drivers twice).
2. Part A: the reproduction again (only the six part-B items hold),
   `p0_4_push_privacy.test.sql` (167 pgTAP checks; those that differ between
   the parts say so), then the P0-1, P0-2 and P0-3 suites.
3. Part B: the reproduction (nothing holds) and the same suites.
4. `p0_4_concurrency.sh` on part A and on part B: two dispatches of one
   booking; the app's dispatch against the one-minute fallback; one
   acceptance announced twice; two outbox flushes; one chat message announced
   twice; one second wave queued twice — everyone told once.
5. Both parts with P0-3 part B underneath.
6. Undo part B (part A's results again), undo part A (all 12 problems back,
   P0-1..P0-3 still pass), then both parts again.

## P0-5 — a company cancels its own bookings, and a cancellation stays final

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=<superuser> supabase/tests/run_p0_5_tests.sh
node supabase/tests/p0_5_client_check.cjs     # the app side, no server needed
```

P0-5 is one migration, `supabase/migrations/20261101120000_company_cancellation.sql`,
applied after P0-4 part A (it tells drivers through part A's server delivery)
and before the app update that calls it. Nothing is sent anywhere. The runner
builds the database as P0-1..P0-4 part A leave it and then runs, in order:

1. `p0_5_bug_reproduction.sql` — 12 BUG checks hold (no server cancel; the
   driver, the driver a job was offered to, the fleet owner and his driver
   not told; no change-log line; the company's direct update cancelling a trip
   in progress or a finished booking, reviving a cancelled one that a driver
   then takes, quietly stopping a car on the road with 'rejected', taking an
   accepted job back by setting it to pending, recording its own cancellation
   as the driver's).
2. P0-5: the reproduction (nothing holds), `p0_5_company_cancel.test.sql`
   (146 pgTAP checks: who may cancel what — company, another company, the
   driver, an unrelated driver, the fleet owner, KEKE; each status; the
   calendar; the change log; who cancelled, written by the server only; the
   fleet owner taken from the fleet, not from a column the company can write;
   each notice once, on the phone too; convoys; dispatch, outbox, reminder
   worker and automatic replacement after a cancellation; an installed app's
   old cancel), the P0-4 reproduction (only its part-B items) and the
   P0-1..P0-4 suites.
3. With P0-3 part B, then also P0-4 part B on top (the state after the whole
   rollout): the same.
4. `p0_5_concurrency.sh` on both states: cancel against a driver's
   acceptance, against the reminder worker's replacement, against a second
   cancel, against the driver's own cancel, against the second-wave flush, and
   a convoy cancelled together with one of its cars — whichever wins, the
   booking ends cancelled, holds no calendar, nothing deadlocks, and each
   person is told what happened to him once.
5. Undo: the P0-4 part A undo refuses while P0-5 is in place; undoing P0-5
   brings the 12 problems back and leaves P0-1..P0-4 passing; P0-5 applied
   again passes again. On both states.

`p0_5_client_check.cjs` compiles the app's TypeScript on the fly with a
recording Supabase client: the call to `cancel_booking_by_company` and each of
its answers, the fallback for a server without it, when the cancel button
shows, the convoy status rule, and every text in all four languages (34
checks).

## Booking import — an imported booking carries only values a person or the server confirmed

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=<superuser> DENO=<deno 2> supabase/tests/run_import_safety_tests.sh
```

Runs everything below in order. Nothing is sent anywhere: the model's answers
are written by the tests, the function's tests run without network permission,
and every database step uses a throwaway local database.

1. `supabase/functions/booking-import/tests` (Deno, 85 tests): times with
   AM/PM and day-part words, prices with separators and currencies, adults +
   children, flight numbers, junk places; the review of every critical value
   (confirmed / conflict / unconfirmed / missing) and its reasons; the signed
   review and the `approve` action; the two model profiles (4.x forced tool,
   5.x auto tool with thinking and effort); one retry on 429/529/5xx/network;
   refusals, cut-off answers, more than 25 services, long files; the role
   check and the daily ceiling; logs without the key, file names, names or
   phones; a written date never read as a time ("20.11.2026" is not 20:11);
   a vehicle, kind or place the request never names is not confirmed; a
   corrected value, a value moved with a tour's start, and every value a new
   service type adds need a person's confirmation.
   The fixtures are invented documents (`make_fixtures.py`).
2. `import_review_client_check.cjs` (33 checks): the app asks for the review
   on every read, cannot create an imported booking until every flagged value
   is confirmed as it now stands (a confirmation is tied to the value: a value
   changed afterwards asks again; typing a day's stops does not), lists what a
   change of service type adds, reads the server's refusal once (message and
   fields), asks the server to approve it, inserts it with
   the approval; a booking typed into the form inserts exactly as before; an
   older server's answer works as before; every text in four languages.
3. `run_import_approval_tests.sh`: the migration
   `20261103200000_booking_import_approvals.sql` on the P0-1..P0-6 database —
   `import_approval.test.sql` (18 checks: manual bookings untouched, an
   approved import goes in once, any other value is refused, expired / other
   company / invented approvals refused, the approvals table is the server's),
   the P0-6 and P0-5 suites and reproductions with it in place, undo and
   apply again, and the P0 release tools (`docs/p0-release`): the smoke test
   passes with the check in place; the P0-6 check and undo refuse while it is
   in place ("triggers differ") and work again once it is undone — so a
   rollback undoes this migration before P0-6.
4. `run_import_e2e.sh` (14 checks): the app's own `draftToInsertInput` and
   `insertBooking` build the request body, the server's review approves it,
   and the database — written to the way PostgREST writes a POST, as the
   company — accepts exactly that body and refuses it with the passengers,
   price, date or a tour day changed after approval; the same body without an
   approval (a booking typed into the form) goes in as before.

## GPS P0 — who sees a driver, when sharing stops, and the watch on every trip

```bash
PGHOST=<local socket or host> PGPORT=<port> PGUSER=postgres supabase/tests/run_gps_p0_tests.sh
node supabase/tests/gps_p0_client_check.cjs     # the app side, no server needed
```

Three migrations, each undone on its own (`supabase/rollback/<same name>_undo.sql`):

- `20261104150000_gps_position_only_during_trip.sql` (P0-1): others see a
  driver's position only while he drives a trip in progress - the trip's company,
  his fleet owner (his driver, or a trip he gave out), KEKE's admins - whatever
  app version he has. The admins' one exception: `gps_admin_open_access(driver,
  reason, minutes)` - a reason of 10+ characters, 1-60 minutes, for that admin
  only, kept in the log `gps_admin_access`. A company's road: while the trip runs;
  afterwards what reached the server during it (or was recorded up to two minutes
  after the end); a trip cancelled under way, up to the cancellation.
- `20261104150100_gps_stop_sharing_after_trip.sql` (P0-2): the server measures
  each phone's clock from its position reports (`gps_device_clock`); a driver's
  own road points are stored only for his trip in progress (time corrected when
  his clock is more than 2 minutes off) or, sent late, for his completed trip if
  recorded before its end, within 48 hours, and his clock was checked and never
  off from an hour before the end; `created_at` is the server's; a trip task's
  reports with no trip in progress are skipped quietly (installed apps never get
  an error to retry forever); every 5 minutes `gps_tidy_pins()` removes positions
  left over from finished trips and any older than 24 hours (positions only); the
  30-day road clean-up counts from arrival, not from the phone's clock.
- `20261104150200_gps_watch_every_trip.sql` (P0-3): `watch_trip_gps()` watches
  every trip in progress (open-screen-only drivers and trips with no position
  too), counts per trip (at most 12 silent wake-ups and 3 notices a trip, by day),
  and positions carry the server's time.

The runner builds production as it is (the snapshots, every migration production
ran, `fixtures/prod_gps_snapshot_2026-11-04.sql`,
`fixtures/prod_tour_days_snapshot_2026-11-04.sql`) and, as on Supabase, lets anon
and authenticated execute every new function in public unless a migration takes
it away. Then:

1. `gps_p0_bug_reproduction.sql` — the 21 problems hold (7 P0-1, 10 P0-2, 4 P0-3);
2. the migrations one at a time — each removes exactly its own; each runs twice;
3. `gps_p0.test.sql` (177 pgTAP checks: three companies, two admins, a fleet
   owner with two drivers and nine other drivers in every booking state, a
   three-day tour from start to end; the app's own writes as PostgREST makes them,
   phone clocks behind, ahead and unknown; the admin exception; the clean-ups;
   the watch with its own clock);
4. every older suite ends exactly as on production without the GPS changes
   (`vehicle_calendar.test.sql` has date-dependent checks; the runner compares
   with production as it is) and the P0-4..P0-6 reproductions are as before;
5. the same with the staged parts (P0-3 part B, P0-4 part B) underneath;
6. `gps_p0_concurrency.sh` — a driver finishing his trip while his phone keeps
   reporting: no error to the phone, nothing left after the end;
7. each undo alone brings back only its own problems; all three undone leave the
   GPS objects exactly as production has them (rules, function bodies and execute
   rights, triggers, cron jobs, columns, tables and their rights); applied again,
   everything passes.

Run it on PostgreSQL 17 (production's major version) and 16.

`gps_p0_client_check.cjs` (47 checks) runs the phone's trip GPS code with stand-ins
for the location service, task manager and storage: the trip task stops itself
only for a trip that is surely over (finished, cancelled, declined), not on a
missing answer or a job not started yet; `stopTripSharing` and where it is called;
what the app does when it comes to the front; the company map asks only for trips
in progress and shows a finished trip's road; live / weak signal / lost, the same
on every company and fleet map.

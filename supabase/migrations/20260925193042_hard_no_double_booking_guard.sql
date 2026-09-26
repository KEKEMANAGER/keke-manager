-- Hard, database-level guarantee that one driver / one vehicle can never hold
-- two overlapping busy blocks at the same time.
--
-- Until now the only protection was client-side filtering when LISTING drivers.
-- acceptBooking() never re-checked, so the same driver could take two jobs on
-- the same dates from the open list.

create extension if not exists btree_gist;

-- Released blocks were being shortened to now(), which for a booking that had
-- not started yet produced end_time < start_time. Normalise those to an EMPTY
-- range, which is the correct representation of "released" and never conflicts.
update public.driver_schedules
set end_time = start_time
where end_time < start_time;

alter table public.driver_schedules
  add column if not exists vehicle_id uuid;

update public.driver_schedules ds
set vehicle_id = b.vehicle_id
from public.bookings b
where ds.booking_id = b.id
  and ds.vehicle_id is null
  and b.vehicle_id is not null;

alter table public.driver_schedules
  drop constraint if exists driver_schedules_time_order_check;
alter table public.driver_schedules
  add constraint driver_schedules_time_order_check
  check (end_time >= start_time);

create unique index if not exists driver_schedules_booking_unique
  on public.driver_schedules (booking_id)
  where booking_id is not null and source = 'booking';

alter table public.driver_schedules
  drop constraint if exists driver_schedules_no_driver_overlap;
alter table public.driver_schedules
  add constraint driver_schedules_no_driver_overlap
  exclude using gist (
    driver_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  );

alter table public.driver_schedules
  drop constraint if exists driver_schedules_no_vehicle_overlap;
alter table public.driver_schedules
  add constraint driver_schedules_no_vehicle_overlap
  exclude using gist (
    vehicle_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (vehicle_id is not null);

create index if not exists driver_schedules_vehicle_time_idx
  on public.driver_schedules (vehicle_id, start_time, end_time)
  where vehicle_id is not null;

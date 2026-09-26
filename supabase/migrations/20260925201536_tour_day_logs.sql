-- A multi-day tour is not one job, it is N days. The driver closes each day as
-- it ends, and only then can the tour be finished with a summary. Before this,
-- a six-day tour was a single "completed" tap at the very end and nobody --
-- not the company, not the driver -- had any record of what happened on day 3.

create table if not exists public.booking_day_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  day_index integer not null check (day_index >= 1),
  day_date date,
  driver_id uuid,
  closed_at timestamptz not null default now(),
  odometer_value numeric check (odometer_value is null or odometer_value >= 0),
  odometer_photo_url text,
  overnight_place text,
  extra_costs_gel numeric check (extra_costs_gel is null or extra_costs_gel >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, day_index)
);

create index if not exists booking_day_logs_booking_idx
  on public.booking_day_logs (booking_id, day_index);

alter table public.booking_day_logs enable row level security;

-- Readable by the people on the booking. Every write goes through the
-- SECURITY DEFINER functions, so there is deliberately no write policy.
drop policy if exists booking_day_logs_select on public.booking_day_logs;
create policy booking_day_logs_select on public.booking_day_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_day_logs.booking_id
         and (b.driver_id = auth.uid()
              or b.host_driver_id = auth.uid()
              or b.company_id = auth.uid())
    )
    or public.is_admin_user()
  );

grant select on public.booking_day_logs to authenticated;

create or replace function public.tour_day_count(p_booking_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select greatest(
    1,
    coalesce(
      nullif(jsonb_array_length(coalesce(b.tour_days, '[]'::jsonb)), 0),
      nullif(jsonb_array_length(coalesce(b.itinerary, '[]'::jsonb)), 0),
      1
    )
  )
  from public.bookings b
  where b.id = p_booking_id;
$$;

-- The day-by-day plan with the log rows merged in -- one row per day of the tour.
create or replace function public.tour_day_plan(p_booking_id uuid)
returns table(
  day_index integer,
  day_date date,
  from_place text,
  to_place text,
  stops text,
  planned_overnight text,
  is_closed boolean,
  can_close boolean,
  closed_at timestamptz,
  odometer_value numeric,
  odometer_photo_url text,
  overnight_place text,
  extra_costs_gel numeric,
  note text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  b record;
  n integer;
  i integer;
  td jsonb;
  it jsonb;
  d_date date;
  log record;
  prev_closed boolean := true;
  day_started boolean;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    return;
  end if;

  n := public.tour_day_count(p_booking_id);

  for i in 1..n loop
    td := coalesce(b.tour_days, '[]'::jsonb) -> (i - 1);
    it := coalesce(b.itinerary, '[]'::jsonb) -> (i - 1);

    d_date := null;
    if td is not null and (td ->> 'date') is not null then
      begin
        d_date := (td ->> 'date')::date;
      exception when others then
        d_date := null;
      end;
    end if;
    if d_date is null then
      d_date := (public.parse_booking_start_ts(b.date_display)
                   at time zone 'Asia/Tbilisi')::date + (i - 1);
    end if;

    select * into log
      from public.booking_day_logs l
     where l.booking_id = p_booking_id and l.day_index = i;

    day_index := i;
    day_date := d_date;
    from_place := coalesce(td ->> 'fromPlace', it ->> 'from');
    to_place := coalesce(td ->> 'toPlace', it ->> 'to');
    stops := coalesce(td ->> 'stops', it ->> 'stops');
    planned_overnight := td ->> 'driverOvernight';

    is_closed := log.id is not null;
    closed_at := log.closed_at;
    odometer_value := log.odometer_value;
    odometer_photo_url := log.odometer_photo_url;
    overnight_place := log.overnight_place;
    extra_costs_gel := log.extra_costs_gel;
    note := log.note;

    -- a day can be closed once its own date has started and the day before it
    -- is already closed; days close in order, never out of sequence
    day_started := d_date is null
                   or now() >= (d_date::timestamp at time zone 'Asia/Tbilisi');
    can_close := (not is_closed)
                 and prev_closed
                 and day_started
                 and b.status = 'in_progress';

    prev_closed := is_closed;
    return next;
  end loop;
end;
$$;

grant execute on function public.tour_day_count(uuid) to authenticated;
grant execute on function public.tour_day_plan(uuid) to authenticated;

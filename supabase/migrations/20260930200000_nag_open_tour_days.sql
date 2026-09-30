-- Closing each day of a tour was already built — odometer, overnight place,
-- extra costs, a photo, in order, one day at a time — and the server already
-- refuses to finish a tour while any day is open.
--
-- What was missing is the thing that makes a driver actually do it *that
-- evening*. The only pressure was at the very end: on day six he taps
-- "complete" and discovers he owes five odometer photos he can no longer take,
-- of a car that has since driven 900 km, on nights he no longer remembers. So
-- he either invents the numbers or the company gets nothing — which is the same
-- as not having the feature. Live proof: a six-day tour that started on 26
-- September still had day 1 open four days later.
--
-- This asks him each evening, and tells the company when a day is left open
-- overnight. Nothing here blocks the trip: a tourist is in the car, and the
-- lever that matters is the record and the company seeing it, not the road.

create table if not exists public.booking_day_nags (
  booking_id         uuid    not null references public.bookings(id) on delete cascade,
  day_index          integer not null,
  driver_nagged_at   timestamptz,
  driver_nag_count   integer not null default 0,
  company_alerted_at timestamptz,
  primary key (booking_id, day_index)
);

alter table public.booking_day_nags enable row level security;
revoke all on public.booking_day_nags from anon, authenticated;

create or replace function public.nag_open_tour_days()
returns int
language plpgsql
security definer
set search_path = public
as $fn$
declare
  b record;
  d record;
  tbilisi_now  timestamp := now() at time zone 'Asia/Tbilisi';
  v_nagged_at  timestamptz;
  v_nag_count  int;
  v_alerted_at timestamptz;
  sent         int := 0;
begin
  for b in
    select bk.id, bk.driver_id, bk.company_id, bk.driver_display_name
      from public.bookings bk
     where bk.status = 'in_progress'
       and bk.driver_id is not null
       and public.tour_day_count(bk.id) > 1
  loop
    -- The first day that is open AND closeable. Days close in order, so this is
    -- the only one he could act on.
    select p.day_index, p.day_date
      into d
      from public.tour_day_plan(b.id) p
     where p.is_closed = false
       and p.can_close = true
     order by p.day_index
     limit 1;
    continue when not found;

    -- Only once the day is actually over: after 20:00 Tbilisi on its own date,
    -- or any time after that date. Asking at lunchtime trains him to ignore it.
    if d.day_date is not null then
      continue when d.day_date > tbilisi_now::date;
      continue when d.day_date = tbilisi_now::date
                and extract(hour from tbilisi_now) < 20;
    end if;

    select n.driver_nagged_at, coalesce(n.driver_nag_count, 0), n.company_alerted_at
      into v_nagged_at, v_nag_count, v_alerted_at
      from public.booking_day_nags n
     where n.booking_id = b.id and n.day_index = d.day_index;
    if not found then
      v_nagged_at := null;
      v_nag_count := 0;
      v_alerted_at := null;
    end if;

    -- Evening, then next morning, then twice more. Past that it is the
    -- company's problem, not a notification problem.
    if (v_nagged_at is null or v_nagged_at < now() - interval '10 hours')
       and v_nag_count < 4 then
      perform public.booking_notify(
        b.driver_id,
        'KEKE · დღის დახურვა',
        'დღე ' || d.day_index || ' დასახურავია — ოდომეტრი, ღამისთევა, ხარჯები',
        'tour_day_open',
        jsonb_build_object(
          'type', 'tour_day_open',
          'booking_id', b.id::text,
          'day_index', d.day_index
        )
      );
      insert into public.booking_day_nags (booking_id, day_index, driver_nagged_at, driver_nag_count)
      values (b.id, d.day_index, now(), 1)
      on conflict (booking_id, day_index) do update
        set driver_nagged_at = now(),
            driver_nag_count = booking_day_nags.driver_nag_count + 1;
      sent := sent + 1;
    end if;

    -- Once, when the day is already yesterday and still open.
    if b.company_id is not null
       and v_alerted_at is null
       and d.day_date is not null
       and d.day_date < tbilisi_now::date then
      perform public.booking_notify(
        b.company_id,
        'KEKE Manager',
        coalesce(nullif(trim(b.driver_display_name), ''), 'მძღოლმა')
          || ' დღე ' || d.day_index || ' არ დახურა',
        'tour_day_open_company',
        jsonb_build_object(
          'type', 'tour_day_open_company',
          'booking_id', b.id::text,
          'day_index', d.day_index
        )
      );
      insert into public.booking_day_nags (booking_id, day_index, company_alerted_at)
      values (b.id, d.day_index, now())
      on conflict (booking_id, day_index) do update
        set company_alerted_at = now();
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$fn$;

revoke execute on function public.nag_open_tour_days() from public, anon, authenticated;

-- Every 15 minutes: the evening ask has to land in the evening, and a 15-minute
-- grain is plenty for a job whose unit is a day.
select cron.unschedule('nag-open-tour-days')
 where exists (select 1 from cron.job where jobname = 'nag-open-tour-days');

select cron.schedule('nag-open-tour-days', '*/15 * * * *', $cron$select public.nag_open_tour_days();$cron$);

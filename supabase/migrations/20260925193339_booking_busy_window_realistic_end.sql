-- Server-side mirror of estimateBookingBusyWindow() in lib/driverSchedules.ts.
-- Both sides must agree: the client uses it to filter, the database uses it to
-- write the block that the EXCLUDE constraint enforces.
create or replace function public.booking_busy_window(p_booking_id uuid)
returns table(win_start timestamptz, win_end timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  b record;
  k text;
  primary_ts timestamptz;
  tin timestamptz;
  tout timestamptz;
  s timestamptz;
  e timestamptz;
  last_day date;
  n_itin int;
  min_len interval;
begin
  select kind, booking_type, date_display, tour_days, itinerary, transfer_in, transfer_out
    into b
    from public.bookings
   where id = p_booking_id;
  if not found then
    return;
  end if;

  k := lower(trim(coalesce(b.kind, b.booking_type, 'transfer')));
  if k in ('day_tour', 'daytour', 'day tour', 'one_day_tour') then
    k := 'day_tour';
  elsif k = 'tour' then
    k := 'tour';
  else
    k := 'transfer';
  end if;

  min_len := case when k = 'transfer' then interval '2 hours' else interval '8 hours' end;

  primary_ts := public.parse_booking_start_ts(b.date_display);
  tin  := public.parse_booking_start_ts(b.transfer_in  ->> 'date');
  tout := public.parse_booking_start_ts(b.transfer_out ->> 'date');

  if k = 'transfer' then
    s := coalesce(primary_ts, now());
    e := s + interval '2 hours';
  elsif k = 'day_tour' then
    s := coalesce(primary_ts, now());
    e := s + interval '8 hours';
  else
    s := coalesce(tin, primary_ts, now());
    e := s + interval '8 hours';

    if tout is not null and tout > s then
      e := tout + interval '8 hours';
    elsif jsonb_array_length(coalesce(b.tour_days, '[]'::jsonb)) > 0 then
      begin
        last_day := ((b.tour_days -> (jsonb_array_length(b.tour_days) - 1)) ->> 'date')::date;
      exception when others then
        last_day := null;
      end;
      if last_day is not null then
        -- a tour day ends in the evening, not at 08:00
        e := (last_day::timestamp at time zone 'Asia/Tbilisi') + interval '20 hours';
      end if;
    elsif jsonb_array_length(coalesce(b.itinerary, '[]'::jsonb)) > 0 then
      n_itin := greatest(1, jsonb_array_length(b.itinerary));
      e := s + (n_itin * interval '8 hours');
    elsif primary_ts is not null and primary_ts > s then
      e := primary_ts + interval '8 hours';
    end if;
  end if;

  if e < s + min_len then
    e := s + min_len;
  end if;

  win_start := s;
  win_end := e;
  return next;
end;
$$;

grant execute on function public.booking_busy_window(uuid) to authenticated;

alter table public.bookings add column if not exists reminder_3h_sent boolean default false;
alter table public.bookings add column if not exists reminder_3h_sent_at timestamptz;
alter table public.bookings add column if not exists reminder_45m_sent boolean default false;
alter table public.bookings add column if not exists reminder_45m_sent_at timestamptz;
alter table public.bookings add column if not exists driver_confirmed_at timestamptz;
alter table public.bookings add column if not exists reassign_count integer not null default 0;

create index if not exists bookings_reminder_scan_idx
  on public.bookings (status)
  where driver_id is not null and status in ('accepted', 'in_progress');

-- One place that writes an in-app notification AND fires the push.
create or replace function public.booking_notify(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  tok text;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, title, body, type, is_read, data)
  values (p_user_id, p_title, p_body, p_type, false, coalesce(p_data, '{}'::jsonb));

  tok := public.fetch_user_push_token(p_user_id);
  if tok is not null then
    perform public.send_expo_push(tok, p_title, p_body, coalesce(p_data, '{}'::jsonb));
  end if;
end;
$$;

-- Move a booking to a new driver, swapping the busy block in the same transaction.
create or replace function public.reassign_booking_to_driver(
  p_booking_id uuid,
  p_new_driver_id uuid,
  p_vehicle_id uuid,
  p_display_name text,
  p_phone text,
  p_plate text
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  w record;
begin
  select * into w from public.booking_busy_window(p_booking_id);
  if w.win_start is null then
    return false;
  end if;

  delete from public.driver_schedules
   where booking_id = p_booking_id and source = 'booking';

  begin
    insert into public.driver_schedules
      (driver_id, vehicle_id, booking_id, start_time, end_time, source)
    values
      (p_new_driver_id, p_vehicle_id, p_booking_id, w.win_start, w.win_end, 'booking');
  exception when exclusion_violation then
    return false;
  end;

  update public.bookings
     set driver_id = p_new_driver_id,
         driver_display_name = nullif(trim(p_display_name), ''),
         driver_phone = nullif(trim(p_phone), ''),
         driver_plate = nullif(trim(p_plate), ''),
         vehicle_id = p_vehicle_id,
         status = 'accepted',
         driver_confirmed_1h = null,
         driver_confirmed_at = null,
         reminder_3h_sent = false,
         reminder_3h_sent_at = null,
         reminder_1h_sent = false,
         reminder_1h_sent_at = null,
         reminder_45m_sent = false,
         reminder_45m_sent_at = null,
         reassign_count = coalesce(reassign_count, 0) + 1,
         updated_at = now()
   where id = p_booking_id;

  return true;
end;
$$;

-- Driver taps "დაადასტურე" at any reminder stage.
create or replace function public.confirm_booking_as_driver(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  b record;
  caller uuid := auth.uid();
begin
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'ჯავშანი ვერ მოიძებნა');
  end if;
  if caller is null or caller <> b.driver_id then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'ეს ჯავშანი შენზე არ არის');
  end if;
  if b.status not in ('accepted', 'in_progress') then
    return jsonb_build_object('ok', false, 'code', 'bad_status',
      'message', 'ჯავშანი სხვა მდგომარეობაშია');
  end if;

  update public.bookings
     set driver_confirmed_1h = true,
         driver_confirmed_at = coalesce(driver_confirmed_at, now()),
         updated_at = now()
   where id = p_booking_id;

  if b.company_id is not null then
    perform public.booking_notify(
      b.company_id,
      'KEKE Manager',
      coalesce(nullif(trim(b.driver_display_name), ''), 'მძღოლმა') || ' დაადასტურა ჯავშანი',
      'booking_driver_confirmed',
      jsonb_build_object('type', 'booking_driver_confirmed', 'bookingId', p_booking_id::text)
    );
  end if;

  return jsonb_build_object('ok', true, 'code', 'confirmed');
end;
$$;

grant execute on function public.confirm_booking_as_driver(uuid) to authenticated;

alter table public.bookings add column if not exists completed_at timestamptz;

update public.bookings
   set completed_at = coalesce(completed_at, updated_at, created_at)
 where status = 'completed' and completed_at is null;

-- Stamp completion / cancellation and attribute who cancelled, so the
-- completion rate in driver_rank_scores() only counts a driver's own no-shows.
create or replace function public.bookings_stamp_lifecycle()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller uuid := auth.uid();
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    if new.cancelled_by is null then
      if caller is not null and caller = old.driver_id then
        new.cancelled_by := 'driver';
      elsif caller is not null and caller = old.company_id then
        new.cancelled_by := 'company';
      elsif caller is null then
        new.cancelled_by := 'system';
      else
        new.cancelled_by := 'admin';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_stamp_lifecycle on public.bookings;
create trigger bookings_stamp_lifecycle
before update on public.bookings
for each row execute function public.bookings_stamp_lifecycle();

-- Free the driver's and the vehicle's slot the moment a booking ends, and ask
-- the company for its review.
create or replace function public.bookings_after_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  route text;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status in ('cancelled', 'rejected') then
    delete from public.driver_schedules
     where booking_id = new.id and source = 'booking';
    return null;
  end if;

  if new.status = 'completed' then
    -- shorten, never invert: an empty range is the correct "released" shape
    update public.driver_schedules
       set end_time = greatest(now(), start_time)
     where booking_id = new.id
       and source = 'booking'
       and end_time > now();

    if new.company_id is not null and new.driver_id is not null then
      route := public.booking_route_summary(new.from_location, new.to_location, new.route::text);
      perform public.booking_notify(
        new.company_id,
        'KEKE Manager',
        'დასრულდა: ' || route || '. გთხოვ შეაფასო მძღოლი — შეფასების გარეშე ახალი ჯავშნის შექმნა შეიზღუდება',
        'booking_review_required',
        jsonb_build_object('type', 'booking_review_required',
                           'bookingId', new.id::text,
                           'driverId', new.driver_id::text));
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists bookings_after_status_change on public.bookings;
create trigger bookings_after_status_change
after update of status on public.bookings
for each row execute function public.bookings_after_status_change();

create or replace function public.company_pending_reviews(p_company_id uuid default null)
returns table(
  booking_id uuid,
  driver_id uuid,
  driver_name text,
  route text,
  date_display text,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    b.id,
    b.driver_id,
    coalesce(nullif(trim(b.driver_display_name), ''), u.full_name),
    public.booking_route_summary(b.from_location, b.to_location, b.route::text),
    b.date_display,
    b.completed_at
  from public.bookings b
  left join public.users u on u.id = b.driver_id
  where b.company_id = coalesce(p_company_id, auth.uid())
    and b.status = 'completed'
    and b.driver_id is not null
    and not exists (
      select 1 from public.ratings ra
       where ra.booking_id = b.id
         and ra.company_id = b.company_id
    )
  order by b.completed_at asc nulls last;
$$;

create or replace function public.company_review_debt(p_company_id uuid default null)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::integer from public.company_pending_reviews(coalesce(p_company_id, auth.uid()));
$$;

grant execute on function public.company_pending_reviews(uuid) to authenticated;
grant execute on function public.company_review_debt(uuid) to authenticated;

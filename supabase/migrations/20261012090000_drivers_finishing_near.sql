-- Empty-leg chaining: who is already finishing a job next to this pickup?
--
-- A driver who drops a group in Kazbegi at 13:00 and drives back to Tbilisi
-- empty is the cheapest possible driver for a 15:00 job out of Kazbegi — and
-- until now dispatch had no idea he was there. The information exists: his
-- `driver_schedules` row knows when he is free, and the booking behind that row
-- knows where it ends.
--
-- It just cannot be read from the client. A company may only select its own
-- bookings, so a company creating a booking cannot see that someone else's job
-- ends nearby. Hence a security-definer function — and one that gives back the
-- absolute minimum: a subset of the driver ids the caller already handed in.
-- No booking id, no company, no price, no passenger. The caller learns that one
-- of its own candidate drivers will be near a place it itself named, which is
-- exactly what it needs to decide whom to push first and nothing more.
--
-- Place matching is done on text the caller supplies rather than derived here,
-- because the region table (`lib/georgiaRegions.ts`) is the tested source of
-- truth for how Georgian place names are spelled and declined, and a second
-- copy of it in SQL would drift.

create or replace function public.drivers_finishing_near(
  p_driver_ids uuid[],
  p_start timestamptz,
  p_lead_minutes integer,
  p_place_keys text[]
) returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_lead integer := greatest(15, least(coalesce(p_lead_minutes, 180), 600));
  v_keys text[];
  v_out uuid[];
begin
  if auth.uid() is null then
    return '{}'::uuid[];
  end if;
  if p_driver_ids is null or array_length(p_driver_ids, 1) is null then
    return '{}'::uuid[];
  end if;

  -- Under four characters a place name starts matching ordinary words, and a
  -- wrong match would hand a first-wave seat to the wrong driver. Same floor
  -- the TypeScript region table uses.
  select array_agg(distinct lower(btrim(k)))
    into v_keys
  from unnest(coalesce(p_place_keys, '{}'::text[])) k
  where length(btrim(k)) >= 4;

  if v_keys is null then
    return '{}'::uuid[];
  end if;

  select coalesce(array_agg(distinct s.driver_id), '{}'::uuid[])
    into v_out
  from public.driver_schedules s
  join public.bookings b on b.id = s.booking_id
  where s.driver_id = any (p_driver_ids)
    and s.end_time <= p_start
    and s.end_time >= p_start - make_interval(mins => v_lead)
    and b.status in ('accepted', 'in_progress', 'completed')
    and b.to_location is not null
    and exists (
      select 1 from unnest(v_keys) k where position(k in lower(b.to_location)) > 0
    );

  return v_out;
end;
$fn$;

revoke all on function public.drivers_finishing_near(uuid[], timestamptz, integer, text[]) from public;
revoke execute on function public.drivers_finishing_near(uuid[], timestamptz, integer, text[]) from anon;
grant execute on function public.drivers_finishing_near(uuid[], timestamptz, integer, text[]) to authenticated, service_role;

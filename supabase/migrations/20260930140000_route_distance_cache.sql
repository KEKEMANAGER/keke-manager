-- Shared cache of driving distances between the place names companies actually
-- type. The price calculator needs kilometres, and the only free source is
-- Nominatim + OSRM, which rate-limits to roughly one request a second and asks
-- callers not to hammer it. Without a cache every phone would re-geocode
-- „თბილისის აეროპორტი" forever and get throttled. With it, the second company
-- to price a Tbilisi–Kazbegi tour pays nothing.
--
-- Rows are written through `upsert_route_distance`, never directly: the RPC
-- bounds the value and refuses to overwrite a fresh row, so one client cannot
-- quietly move everyone's prices. The number only ever feeds a *suggested*
-- price the company can override, so the blast radius of a bad row is a wrong
-- hint, not a wrong booking.

create table if not exists public.route_distances (
  from_key    text        not null,
  to_key      text        not null,
  distance_km numeric     not null check (distance_km > 0 and distance_km <= 3000),
  source      text        not null default 'osrm',
  updated_at  timestamptz not null default now(),
  primary key (from_key, to_key)
);

alter table public.route_distances enable row level security;

drop policy if exists route_distances_read on public.route_distances;
create policy route_distances_read
  on public.route_distances
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy: writes go through the RPC below.

create or replace function public.upsert_route_distance(
  p_from_key text,
  p_to_key   text,
  p_km       numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  f text := lower(btrim(coalesce(p_from_key, '')));
  t text := lower(btrim(coalesce(p_to_key, '')));
begin
  if auth.uid() is null then
    return;
  end if;
  if f = '' or t = '' or length(f) > 200 or length(t) > 200 then
    return;
  end if;
  if p_km is null or p_km <= 0 or p_km > 3000 then
    return;
  end if;

  insert into public.route_distances (from_key, to_key, distance_km, source, updated_at)
  values (f, t, round(p_km::numeric, 1), 'osrm', now())
  on conflict (from_key, to_key) do update
    set distance_km = excluded.distance_km,
        updated_at  = now()
  -- a fresh row is left alone; roads do not move
  where public.route_distances.updated_at < now() - interval '90 days';
end;
$fn$;

revoke execute on function public.upsert_route_distance(text, text, numeric) from public, anon;
grant execute on function public.upsert_route_distance(text, text, numeric) to authenticated;

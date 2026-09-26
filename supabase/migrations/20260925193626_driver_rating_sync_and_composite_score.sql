-- 1) users.rating had NO trigger keeping it in sync with the ratings table —
--    the column simply sat there. 2) Dispatch order was a raw star average,
--    which locks new drivers out permanently (0 stars -> no jobs -> no reviews
--    -> still 0). This replaces it with a composite score.

alter table public.bookings add column if not exists cancelled_by text;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings drop constraint if exists bookings_cancelled_by_check;
alter table public.bookings add constraint bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('driver', 'company', 'admin', 'system'));

alter table public.users add column if not exists rating_count integer not null default 0;
alter table public.users add column if not exists last_dispatched_at timestamptz;

create or replace function public.refresh_driver_rating(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a numeric;
  n integer;
begin
  if p_driver_id is null then
    return;
  end if;
  select round(avg(overall)::numeric, 2), count(*)
    into a, n
    from public.ratings
   where driver_id = p_driver_id
     and overall is not null;
  update public.users
     set rating = coalesce(a, 0),
         rating_count = coalesce(n, 0)
   where id = p_driver_id;
end;
$$;

create or replace function public.ratings_sync_driver_rating()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_driver_rating(old.driver_id);
    return null;
  end if;
  perform public.refresh_driver_rating(new.driver_id);
  if tg_op = 'UPDATE' and old.driver_id is distinct from new.driver_id then
    perform public.refresh_driver_rating(old.driver_id);
  end if;
  return null;
end;
$$;

drop trigger if exists ratings_sync_driver_rating on public.ratings;
create trigger ratings_sync_driver_rating
after insert or update or delete on public.ratings
for each row execute function public.ratings_sync_driver_rating();

update public.users set rating = 0, rating_count = 0 where role = 'driver';
do $$
declare d uuid;
begin
  for d in select distinct driver_id from public.ratings where driver_id is not null loop
    perform public.refresh_driver_rating(d);
  end loop;
end;
$$;

-- Composite dispatch score:
--   60% stars, Bayesian-smoothed so one review cannot outrank two hundred
--   25% confirmation rate   (does he answer when a job is assigned?)
--   15% completion rate     (does he finish what he takes?)
-- Laplace priors start a new driver neutral rather than at the bottom, so they
-- can earn their first jobs instead of being locked out forever.
drop function if exists public.driver_rank_scores(uuid[]);

create function public.driver_rank_scores(p_driver_ids uuid[] default null)
returns table(
  driver_id uuid,
  display_rating numeric,
  rating_count integer,
  bayes_rating numeric,
  confirm_rate numeric,
  completion_rate numeric,
  completed_count integer,
  is_new_driver boolean,
  rank_score numeric,
  last_dispatched_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with raw as (
    select coalesce(sum(overall), 0)::numeric as gs, count(*)::numeric as gn
      from public.ratings where overall is not null
  ),
  g as (
    -- the platform mean is itself smoothed toward a neutral 4.3, so the first
    -- two reviews on the platform cannot define the prior for everybody
    select (raw.gs + 4.3 * 10) / (raw.gn + 10) as m, 5::numeric as c
      from raw
  ),
  r as (
    select ra.driver_id as did,
           sum(ra.overall)::numeric as s,
           count(*)::numeric as n
      from public.ratings ra
     where ra.driver_id is not null and ra.overall is not null
     group by ra.driver_id
  ),
  bk as (
    select bo.driver_id as did,
           count(*) filter (where bo.reminder_1h_sent is true)::numeric as asked,
           count(*) filter (where bo.driver_confirmed_1h is true)::numeric as confirmed,
           count(*) filter (where bo.status = 'completed')::numeric as completed,
           count(*) filter (where bo.status = 'cancelled' and bo.cancelled_by = 'driver')::numeric as drv_cancelled
      from public.bookings bo
     where bo.driver_id is not null
     group by bo.driver_id
  ),
  base as (
    select
      u.id as did,
      u.last_dispatched_at as last_disp,
      coalesce(r.n, 0) as n,
      coalesce(r.s, 0) as s,
      (g.c * g.m + coalesce(r.s, 0)) / (g.c + coalesce(r.n, 0)) as bayes,
      (coalesce(bk.confirmed, 0) + 3) / (coalesce(bk.asked, 0) + 4) as conf,
      (coalesce(bk.completed, 0) + 3)
        / (coalesce(bk.completed, 0) + coalesce(bk.drv_cancelled, 0) + 4) as compl,
      coalesce(bk.completed, 0) as done
    from public.users u
    cross join g
    left join r  on r.did  = u.id
    left join bk on bk.did = u.id
    where u.role = 'driver'
      and (p_driver_ids is null or u.id = any (p_driver_ids))
  )
  select
    base.did,
    case when base.n > 0 then round(base.s / base.n, 2) else 0::numeric end,
    base.n::integer,
    round(base.bayes, 3),
    round(base.conf, 3),
    round(base.compl, 3),
    base.done::integer,
    (base.done < 5),
    round(
      0.60 * ((base.bayes - 1) / 4)
    + 0.25 * base.conf
    + 0.15 * base.compl
    , 4),
    base.last_disp
  from base;
$$;

-- Round-robin fairness: equally scored drivers take turns at the front.
create or replace function public.mark_drivers_dispatched(p_driver_ids uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.users
     set last_dispatched_at = now()
   where role = 'driver'
     and id = any (coalesce(p_driver_ids, array[]::uuid[]));
$$;

grant execute on function public.driver_rank_scores(uuid[]) to authenticated;
grant execute on function public.mark_drivers_dispatched(uuid[]) to authenticated;

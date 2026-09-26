-- Reviews are how the dispatch algorithm learns anything. Optional reviews mean
-- no data, so the gate is hard: past the limit, the database itself refuses a
-- new booking. Group legs, emergency replacements and admins are exempt.
create or replace function public.review_debt_limit()
returns integer
language sql
immutable
set search_path to 'public'
as $$ select 3; $$;

create or replace function public.enforce_company_review_debt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  debt integer;
  lim integer := public.review_debt_limit();
begin
  if new.company_id is null then
    return new;
  end if;

  if new.parent_booking_id is not null
     or coalesce(new.is_emergency_replacement, false) then
    return new;
  end if;

  if public.is_admin_user() then
    return new;
  end if;

  select count(*) into debt
    from public.bookings b
   where b.company_id = new.company_id
     and b.status = 'completed'
     and b.driver_id is not null
     and not exists (
       select 1 from public.ratings ra
        where ra.booking_id = b.id
          and ra.company_id = b.company_id
     );

  if debt >= lim then
    raise exception
      'REVIEW_DEBT: % შეუფასებელი დასრულებული ჯავშანი გაქვს. გთხოვ შეაფასო მძღოლები, სანამ ახალ ჯავშანს შექმნი.', debt
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_company_review_debt on public.bookings;
create trigger enforce_company_review_debt
before insert on public.bookings
for each row execute function public.enforce_company_review_debt();

grant execute on function public.review_debt_limit() to authenticated;

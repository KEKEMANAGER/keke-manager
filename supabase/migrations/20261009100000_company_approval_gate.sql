-- A company that has not been approved yet cannot create bookings.
--
-- The app now shows such a company a waiting screen instead of the dashboard,
-- but a screen is not a rule. Until this migration the only condition on
-- inserting a booking was "the company_id is me" — so anyone who signed up
-- could push work to real drivers before a human had looked at who they were.
--
-- Nobody who exists today is affected: every company row is already
-- verification_status 'approved' with is_verified true.

create or replace function public.company_can_create_bookings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_blocked, false) = false
      and (
        u.role = 'admin'
        or (
          u.role = 'company'
          -- Deliberately an OR, and deliberately the same predicate the app
          -- uses in lib/companyVerificationGate.ts: a half-written approval
          -- (the panel writes `users` and `profiles` in two statements) must
          -- not let a company into the app and then have every insert fail.
          -- Rejection sets all of these to the negative, and since
          -- 20261010073000 only an admin can write 'approved' into
          -- verification_status, so none of them can be self-granted.
          and (
            lower(btrim(coalesce(u.verification_status, ''))) = 'approved'
            or u.is_verified = true
            or exists (
              select 1 from public.profiles pr
              where pr.id = u.id and pr.is_verified = true
            )
          )
        )
      )
  );
$$;

comment on function public.company_can_create_bookings() is
  'True when the signed-in user is an admin, or an approved and unblocked company. Guards booking INSERT.';

grant execute on function public.company_can_create_bookings() to authenticated;

-- Every permissive INSERT policy on bookings has to carry the condition,
-- because they are OR'd together — one left alone is the whole gate left
-- open. Which of them exist differs between the live database (where
-- "Companies create bookings" survives from early hand-written SQL) and one
-- rebuilt from these files, so each is altered only if present and created
-- otherwise. ALTER POLICY has no IF EXISTS, hence the catalog check.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'Companies create bookings'
  ) then
    execute $q$
      alter policy "Companies create bookings" on public.bookings
        with check (auth.uid() = company_id and public.company_can_create_bookings())
    $q$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'bookings'
      and policyname = 'bookings_insert_company'
  ) then
    execute $q$
      alter policy "bookings_insert_company" on public.bookings
        with check (
          company_id::text = (auth.uid())::text
          and public.company_can_create_bookings()
        )
    $q$;
  else
    execute $q$
      create policy "bookings_insert_company" on public.bookings
        for insert with check (
          company_id::text = (auth.uid())::text
          and public.company_can_create_bookings()
        )
    $q$;
  end if;
end $$;

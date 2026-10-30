-- Profile saves from app versions older than 27 October work again.
--
-- Akaki: a driver (Nikoloz Dzneladze) saved his profile and got "წვდომა
-- შეზღუდულია". App versions from before 27 October write the birth date
-- straight into profiles.birth_date with an upsert, and an upsert needs the
-- column readable; the 27 October lockdown made it unreadable so nobody could
-- read anyone else's birth date. On such a phone every profile save ended in
-- that message (everything else in the profile was saved).
--
-- The column is readable again but never holds a date: whatever is written
-- there moves into private_birth_dates, which only the owner's own functions
-- (my_birth_date / set_my_birth_date) reach. Old and new app versions both
-- save the date, and other people's birth dates stay unreadable.

create table if not exists public.private_birth_dates (
  user_id    uuid primary key,
  birth_date date,
  updated_at timestamptz not null default now()
);

alter table public.private_birth_dates enable row level security;
revoke all on public.private_birth_dates from anon, authenticated;

insert into public.private_birth_dates (user_id, birth_date)
select id, birth_date from public.profiles where birth_date is not null
on conflict (user_id) do nothing;

-- a date written into profiles moves to the private table
create or replace function public.profiles_keep_birth_date_private()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.birth_date is not null then
    insert into public.private_birth_dates (user_id, birth_date, updated_at)
    values (new.id, new.birth_date, now())
    on conflict (user_id) do update
      set birth_date = excluded.birth_date, updated_at = now();
    new.birth_date := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_keep_birth_date_private() from public, anon, authenticated;

create or replace trigger profiles_keep_birth_date_private
  before insert or update of birth_date on public.profiles
  for each row
  execute function public.profiles_keep_birth_date_private();

update public.profiles set birth_date = null where birth_date is not null;

-- one's own date, for the app versions that ask through functions
create or replace function public.my_birth_date()
returns date
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.birth_date from public.private_birth_dates d where d.user_id = auth.uid();
$$;

create or replace function public.set_my_birth_date(p_birth_date date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into public.private_birth_dates (user_id, birth_date, updated_at)
  values (auth.uid(), p_birth_date, now())
  on conflict (user_id) do update
    set birth_date = excluded.birth_date, updated_at = now();
  insert into public.profiles (id) values (auth.uid())
  on conflict (id) do nothing;
end;
$$;

-- old versions' upsert can run again; the column it reads is always empty
grant select (birth_date) on public.profiles to authenticated;

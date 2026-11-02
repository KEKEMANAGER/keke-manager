-- A company is asked to correct its profile — its real company name, its
-- logo — before it goes on using KEKE Manager.
--
-- An admin holds the company (verification_status 'rejected', as the admin
-- panel's reject does) and sets profile_fix to what must be corrected:
--
--   {"fields": ["company_name", "logo"], "name_was": "<the name to replace>"}
--
-- The app then shows that company a form for exactly those things, and
-- nothing else. The moment the company has corrected all of them — a company
-- name of at least two letters other than the one it had, a logo (a picture
-- link) — this trigger lets it back in by itself: approved again, the request
-- cleared. No second look by the admin is needed, and no one else is
-- affected: a company without a profile_fix request is never approved by
-- this trigger, and only KEKE Manager (an admin or the server) sets or
-- withdraws a request — on sign-up as well as later.
--
-- The company name is users.full_name: it is what the app, the booking
-- emails and the drivers' notifications show (users.company_name is empty
-- for every company and is only a fallback in front of it).
--
-- It runs after guard_users_privileged_columns (BEFORE triggers fire in name
-- order), which has by then checked the company's own change; the approval
-- written here is the server's, not the company's. The company's own UPDATE
-- still has to pass the RLS check on the new row: users_update_self alone
-- would refuse it (it pins is_verified to the stored value), the permissive
-- users_update_own_phone (id = auth.uid()) lets it through — as it lets every
-- own-row update through today. The tests run against those policies.
--
-- Rollback: supabase/rollback/20261102140000_company_profile_fix_undo.sql

alter table public.users add column if not exists profile_fix jsonb;

comment on column public.users.profile_fix is
  'What KEKE Manager asked this company to correct before it may go on: {"fields": ["company_name","logo"], "name_was": "..."}. Set by an admin; cleared by users_profile_fix() once corrected.';

create or replace function public.users_profile_fix()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  need text[];
  name_ok boolean;
  logo_ok boolean;
begin
  if (tg_op = 'INSERT' and new.profile_fix is not null)
     or (tg_op = 'UPDATE' and new.profile_fix is distinct from old.profile_fix) then
    -- Asked for, or withdrawn, by KEKE Manager only.
    if not (coalesce(auth.role(), '') = 'service_role'
            or session_user in ('postgres', 'supabase_admin')
            or public.is_admin_user()) then
      raise exception 'profile_fix is set by KEKE Manager' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op <> 'UPDATE' or new.profile_fix is null or new.role is distinct from 'company' then
    return new;
  end if;

  need := array(select jsonb_array_elements_text(coalesce(new.profile_fix -> 'fields', '[]'::jsonb)));
  name_ok := not ('company_name' = any (need))
    or (char_length(btrim(coalesce(new.full_name, ''))) >= 2
        and lower(btrim(new.full_name)) <> lower(btrim(coalesce(new.profile_fix ->> 'name_was', ''))));
  logo_ok := not ('logo' = any (need)) or btrim(coalesce(new.avatar_url, '')) ~* '^https?://';

  if name_ok and logo_ok then
    new.profile_fix := null;
    new.verification_status := 'approved';
    new.is_verified := true;
    new.rejection_reason := null;
    -- profiles.is_verified is left as it is: its own guard lets only an admin
    -- change it, and nothing a company can do depends on it once users says
    -- approved (company_can_create_bookings() and the app read either).
  end if;
  return new;
end;
$fn$;

revoke all on function public.users_profile_fix() from public, anon, authenticated;

drop trigger if exists users_profile_fix on public.users;
create trigger users_profile_fix
  before insert or update on public.users
  for each row execute function public.users_profile_fix();

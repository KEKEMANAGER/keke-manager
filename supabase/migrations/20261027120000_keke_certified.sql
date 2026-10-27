-- KEKE Certified: a driver the admin has certified after the KEKE training and
-- a short test. Companies see the badge next to his name, and dispatch puts him
-- ahead of drivers who are not (lib/driverRatingSort.ts, after region coverage
-- and the empty leg, before the score).

alter table public.users add column if not exists keke_certified_at timestamptz;

comment on column public.users.keke_certified_at is
  'When the admin made this driver KEKE Certified; null = not certified. Set only through admin_set_keke_certified().';

-- Only an admin sets or clears it: otherwise the owner of the row could certify
-- himself with an ordinary profile update. Same function as before, plus the
-- two keke_certified_at checks.
create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' THEN
      RAISE EXCEPTION 'privileged column: cannot set role to admin'
        USING ERRCODE = '42501';
    END IF;
    IF COALESCE(NEW.is_verified, false) THEN
      NEW.is_verified := false;
    END IF;
    -- A row cannot be born approved.
    IF lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('', 'pending', 'submitted') THEN
      NEW.verification_status := 'pending';
    END IF;
    -- Nor certified.
    NEW.keke_certified_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'privileged column: is_verified cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    -- verification_status decides who gets into the app, so only an admin may
    -- write a verdict into it. The owner may still move their own row between
    -- 'pending' and 'submitted', which is what uploading documents does.
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('pending', 'submitted')
    THEN
      RAISE EXCEPTION 'privileged column: verification_status cannot be set to %', NEW.verification_status
        USING ERRCODE = '42501';
    END IF;

    IF NEW.keke_certified_at IS DISTINCT FROM OLD.keke_certified_at THEN
      RAISE EXCEPTION 'privileged column: keke_certified_at cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF OLD.role IS NULL
         AND NEW.role IN ('driver', 'company')
         AND NEW.id = auth.uid()
      THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'privileged column: role cannot be changed'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- The admin panel's button. Certifying keeps the first date; removing clears it.
create or replace function public.admin_set_keke_certified(p_user_id uuid, p_certified boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if not public.is_admin_user() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.users
     set keke_certified_at = case when p_certified then coalesce(keke_certified_at, now()) end
   where id = p_user_id
     and role = 'driver'
  returning keke_certified_at into v_at;
  if not found then
    raise exception 'driver not found' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

revoke all on function public.admin_set_keke_certified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_keke_certified(uuid, boolean) to authenticated, service_role;

-- Companies read drivers through this directory; the badge comes with it.
-- Same view as before with the new column at the end.
create or replace view public.users_directory as
 SELECT id,
    role,
    full_name,
    avatar_url,
    bio,
    languages,
    city,
    is_verified,
    verification_status,
    is_hired_driver,
    is_guide_driver,
    available_for_hire,
    experience_years,
    created_at,
    service_regions,
    travels_countrywide,
    keke_certified_at
   FROM users
  WHERE role = 'driver'::text AND COALESCE(is_verified, false) = true OR role = 'company'::text;

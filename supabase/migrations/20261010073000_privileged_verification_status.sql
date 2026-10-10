-- `users.verification_status` becomes a privileged column.
--
-- This is the hole under the company gate. `users_update_own_phone` lets a
-- user write their own row with no column restrictions, and
-- `guard_users_privileged_columns` pinned only `is_verified` and `role`. So a
-- company sitting on the new waiting screen could send
--
--   PATCH /rest/v1/users?id=eq.<own id>  {"verification_status":"approved"}
--
-- and walk straight in — RLS passed, the trigger passed, and both the app gate
-- and `company_can_create_bookings()` read that column. The driver gate was
-- never exposed to this because it demands `is_verified` as well, and that one
-- was guarded.
--
-- The owner keeps the write they actually need: moving their own row between
-- 'pending' and 'submitted' is what uploading documents does
-- (`lib/verification.ts`). Only an admin, or the service role, can write a
-- verdict.

create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
      RAISE EXCEPTION 'privileged column: is_verified cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND lower(btrim(coalesce(NEW.verification_status, ''))) NOT IN ('pending', 'submitted')
    THEN
      RAISE EXCEPTION 'privileged column: verification_status cannot be set to %', NEW.verification_status
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
$fn$;

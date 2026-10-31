-- Read-only snapshot of the PRODUCTION objects the P0-3 tests need on top of
-- prod_booking_lifecycle_snapshot_2026-10-31.sql and
-- prod_reminders_snapshot_2026-10-31.sql. Captured on 2026-10-31 from the
-- live catalog of project brrjuxgxmpgvkddcuaad with SELECT queries only.
-- Schema only: no rows, no secrets.
--
--   * booking_history (the change log a company writes when it edits a
--     booking) with its RLS policies and grants. Its email trigger is left
--     out (the e-mail queue is not part of these tests).
--   * the BEFORE trigger that guards privileged columns of public.users
--   * the two triggers on public.vehicles (activate on approval, copy the
--     car's type/class to the profile) and the admin's approve / reject
--     functions the admin panel calls
--   * the four Storage policies of the bucket booking-pickup-signs
--
-- Load after the two snapshots above (and supabase_shim.sql, which has the
-- storage.objects stand-in). A TEST FIXTURE, not a migration.
set check_function_bodies = off;

-- ===================================================== booking_history
create table public.booking_history (
  id uuid default gen_random_uuid() not null,
  booking_id uuid,
  changed_by uuid,
  changes jsonb not null,
  reason text,
  created_at timestamp with time zone default now()
);
alter table public.booking_history add constraint booking_history_pkey primary key (id);
alter table public.booking_history add constraint booking_history_booking_id_fkey foreign key (booking_id) references public.bookings(id) on delete cascade;
alter table public.booking_history add constraint booking_history_changed_by_fkey foreign key (changed_by) references auth.users(id);
alter table public.booking_history enable row level security;
create policy booking_history_insert_company on public.booking_history as PERMISSIVE for INSERT to authenticated with check ((changed_by = auth.uid()));
create policy booking_history_read_own on public.booking_history as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = booking_history.booking_id) AND (((b.company_id)::text = (auth.uid())::text) OR (b.driver_id = auth.uid()) OR (b.host_driver_id = auth.uid()))))));
grant select, insert, update, delete, truncate, references, trigger on public.booking_history to anon, authenticated, service_role;

-- ===================================================== users: privileged-column guard
CREATE OR REPLACE FUNCTION public.guard_users_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
revoke all on function public.guard_users_privileged_columns() from public;
grant execute on function public.guard_users_privileged_columns() to service_role;
CREATE TRIGGER guard_users_privileged_columns BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION guard_users_privileged_columns();

-- ===================================================== vehicles: triggers
CREATE OR REPLACE FUNCTION public.vehicles_activate_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.verification_status = 'approved'
     and coalesce(new.is_active, false) = false
     and new.driver_id is not null
     and not exists (
       select 1 from public.vehicles v
        where v.driver_id = new.driver_id
          and v.id <> new.id
          and v.is_active = true
     )
  then
    new.is_active := true;
  end if;
  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.sync_profile_on_vehicle_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE norm_type text; norm_class text; BEGIN norm_type := CASE NEW.type WHEN 'სედანი' THEN 'sedan' WHEN 'მინივენი' THEN 'minivan' WHEN 'მიკროავტობუსი' THEN 'microbus' WHEN 'ავტობუსი' THEN 'bus' WHEN 'სპეც. ტრანსპორტი' THEN 'special' WHEN 'SUV' THEN 'suv' ELSE LOWER(TRIM(COALESCE(NEW.type,''))) END; norm_class := CASE NEW.class WHEN 'ეკონომი' THEN 'economy' WHEN 'კომფორტი' THEN 'comfort' WHEN 'ბიზნეს' THEN 'business' WHEN 'პრემიუმ' THEN 'premium' WHEN 'VIP' THEN 'vip' ELSE LOWER(TRIM(COALESCE(NEW.class,''))) END; UPDATE profiles SET vehicle_type = norm_type, vehicle_class = norm_class WHERE id = NEW.driver_id; IF NOT FOUND THEN INSERT INTO profiles (id, email, full_name, vehicle_type, vehicle_class) SELECT NEW.driver_id, u.email, u.full_name, norm_type, norm_class FROM users u WHERE u.id = NEW.driver_id; END IF; RETURN NEW; END; $function$;
revoke all on function public.vehicles_activate_on_approval() from public;
grant execute on function public.vehicles_activate_on_approval() to service_role;
revoke all on function public.sync_profile_on_vehicle_change() from public;
grant execute on function public.sync_profile_on_vehicle_change() to service_role;
CREATE TRIGGER sync_profile_on_vehicle AFTER INSERT OR UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION sync_profile_on_vehicle_change();
CREATE TRIGGER vehicles_activate_on_approval BEFORE INSERT OR UPDATE OF verification_status, is_verified ON public.vehicles FOR EACH ROW EXECUTE FUNCTION vehicles_activate_on_approval();

-- ===================================================== vehicles: the admin's approve / reject
CREATE OR REPLACE FUNCTION public.admin_approve_vehicle_verification(p_vehicle_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  updated_id uuid;
  v_plate text;
  v_model text;
  v_type text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.users u where u.id = uid and u.role = 'admin'
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- A vehicle with no plate and no model is not a registration, it is the
  -- draft row the app creates the moment a driver taps "Add vehicle" —
  -- carrying the form's default type (sedan) with his photos attached. Nine
  -- of those had already been approved and were receiving sedan bookings,
  -- one of them from a driver who actually drives a bus. Approving is how
  -- they got live, so this is where it stops.
  select btrim(coalesce(v.plate, '')), btrim(coalesce(v.model, '')), v.type
    into v_plate, v_model, v_type
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_plate = '' or v_model = '' then
    raise exception 'vehicle is incomplete: a plate and a model are required before approval'
      using errcode = '23514';
  end if;

  update public.vehicles v
  set
    is_verified = true,
    verification_status = 'approved',
    rejection_reason = null,
    updated_at = now()
  where v.id = p_vehicle_id
    and v.verification_status in ('pending', 'submitted')
  returning v.id into updated_id;

  return updated_id is not null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.admin_reject_vehicle_verification(p_vehicle_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  updated_id uuid;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = uid AND u.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  IF reason IS NULL THEN
    RAISE EXCEPTION 'rejection reason required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.vehicles v
  SET
    is_verified = false,
    verification_status = 'rejected',
    rejection_reason = reason,
    is_active = false,
    updated_at = now()
  WHERE v.id = p_vehicle_id
    AND v.verification_status IN ('pending', 'submitted')
  RETURNING v.id INTO updated_id;
  RETURN updated_id IS NOT NULL;
END;
$function$;
revoke all on function public.admin_approve_vehicle_verification(uuid) from public;
grant execute on function public.admin_approve_vehicle_verification(uuid) to authenticated, service_role;
revoke all on function public.admin_reject_vehicle_verification(uuid, text) from public;
grant execute on function public.admin_reject_vehicle_verification(uuid, text) to authenticated, service_role;

-- ===================================================== storage: bucket booking-pickup-signs
create policy pickup_signs_company_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'booking-pickup-signs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[2]) AND ((b.company_id)::text = (auth.uid())::text))))));
create policy pickup_signs_company_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'booking-pickup-signs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.id)::text = (storage.foldername(objects.name))[2]) AND ((b.company_id)::text = (auth.uid())::text))))));
create policy pickup_signs_company_update on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'booking-pickup-signs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) with check (((bucket_id = 'booking-pickup-signs'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy pickup_signs_public_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'booking-pickup-signs'::text));

reset check_function_bodies;

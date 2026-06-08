-- Driver availability for emergency replacement (no GPS).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_city text,
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_updated_at timestamptz;

COMMENT ON COLUMN public.users.current_city IS 'City where the driver is available now (Georgian name).';
COMMENT ON COLUMN public.users.is_available IS 'True when driver opted in for emergency replacement calls.';
COMMENT ON COLUMN public.users.available_updated_at IS 'Last time availability toggle or city was updated.';

CREATE INDEX IF NOT EXISTS users_available_city_idx
  ON public.users (current_city, is_available)
  WHERE role = 'driver'
    AND is_available = true
    AND current_city IS NOT NULL
    AND trim(current_city) <> '';

-- Companies: list verified, non-hired drivers marked available in a city (includes phone).
CREATE OR REPLACE FUNCTION public.list_available_drivers_in_city(p_city text)
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  current_city text,
  available_updated_at timestamptz,
  avatar_url text,
  vehicle_type text,
  vehicle_class text,
  vehicle_plate text,
  is_guide_driver boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.full_name,
    u.phone,
    u.current_city,
    u.available_updated_at,
    u.avatar_url,
    p.vehicle_type,
    p.vehicle_class,
    (
      SELECT v.plate
      FROM public.vehicles v
      WHERE v.driver_id::text = u.id::text
        AND COALESCE(v.is_active, true) = true
      ORDER BY v.updated_at DESC NULLS LAST
      LIMIT 1
    ) AS vehicle_plate,
    COALESCE(u.is_guide_driver, false) AS is_guide_driver
  FROM public.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE EXISTS (
      SELECT 1
      FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role = 'company'
    )
    AND u.role = 'driver'
    AND COALESCE(u.is_verified, false) = true
    AND COALESCE(u.is_hired_driver, false) = false
    AND u.is_available = true
    AND u.current_city IS NOT NULL
    AND trim(u.current_city) <> ''
    AND lower(trim(u.current_city)) = lower(trim(COALESCE(p_city, '')))
  ORDER BY u.available_updated_at DESC NULLS LAST, u.full_name ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_available_drivers_in_city(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_available_drivers_in_city(text) TO authenticated, service_role;

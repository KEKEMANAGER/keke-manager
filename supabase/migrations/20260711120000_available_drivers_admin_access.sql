-- Emergency driver search:
-- 1) Allow admin accounts (role = 'admin') — owner uses admin + company UI.
-- 2) Match ANY active vehicle (not only the most recently updated one).

DROP FUNCTION IF EXISTS public.list_available_drivers_in_city(text, text, text);

CREATE OR REPLACE FUNCTION public.list_available_drivers_in_city(
  p_city text,
  p_vehicle_type text DEFAULT NULL,
  p_vehicle_class text DEFAULT NULL
)
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
    v.type AS vehicle_type,
    v.class AS vehicle_class,
    v.plate AS vehicle_plate,
    COALESCE(u.is_guide_driver, false) AS is_guide_driver
  FROM public.users u
  INNER JOIN LATERAL (
    SELECT
      vv.type,
      vv.class,
      vv.plate
    FROM public.vehicles vv
    WHERE vv.driver_id::text = u.id::text
      AND COALESCE(vv.is_active, true) = true
      AND (
        p_vehicle_type IS NULL
        OR trim(p_vehicle_type) = ''
        OR lower(trim(vv.type)) = lower(trim(p_vehicle_type))
      )
      AND (
        p_vehicle_class IS NULL
        OR trim(p_vehicle_class) = ''
        OR lower(trim(vv.class)) = lower(trim(p_vehicle_class))
      )
    ORDER BY vv.updated_at DESC NULLS LAST
    LIMIT 1
  ) v ON true
  WHERE EXISTS (
      SELECT 1
      FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role IN ('company', 'admin')
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

REVOKE ALL ON FUNCTION public.list_available_drivers_in_city(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_available_drivers_in_city(text, text, text) TO authenticated, service_role;

-- Host: full profile for a fleet sub-driver (phone, bio, vehicle, rating, active trip).

CREATE OR REPLACE FUNCTION public.get_fleet_member_profile(
  p_host_driver_id uuid,
  p_sub_driver_id uuid
)
RETURNS TABLE (
  sub_driver_id uuid,
  fleet_id uuid,
  fleet_status text,
  fleet_created_at timestamptz,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  bio text,
  languages text[],
  experience_years integer,
  is_verified boolean,
  vehicle_id uuid,
  vehicle_model text,
  vehicle_plate text,
  vehicle_type text,
  vehicle_class text,
  vehicle_color text,
  vehicle_year integer,
  vehicle_photo_front text,
  rating_average numeric,
  rating_count integer,
  active_booking_id uuid,
  active_booking_route text,
  active_booking_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.sub_driver_id,
    f.id AS fleet_id,
    f.status AS fleet_status,
    f.created_at AS fleet_created_at,
    u.full_name,
    u.email,
    u.phone,
    u.avatar_url,
    u.bio,
    u.languages,
    u.experience_years,
    COALESCE(u.is_verified, false) AS is_verified,
    v.id AS vehicle_id,
    v.model AS vehicle_model,
    v.plate AS vehicle_plate,
    v.type AS vehicle_type,
    v.class AS vehicle_class,
    v.color AS vehicle_color,
    v.year AS vehicle_year,
    v.photo_front AS vehicle_photo_front,
    (
      SELECT ROUND(AVG(r.overall)::numeric, 2)
      FROM public.ratings r
      WHERE r.driver_id::text = f.sub_driver_id::text
    ) AS rating_average,
    (
      SELECT COUNT(*)::integer
      FROM public.ratings r
      WHERE r.driver_id::text = f.sub_driver_id::text
    ) AS rating_count,
    ab.id AS active_booking_id,
    ab.route AS active_booking_route,
    ab.status AS active_booking_status
  FROM public.driver_fleet f
  INNER JOIN public.users u ON u.id = f.sub_driver_id
  LEFT JOIN public.vehicles v ON v.id = f.vehicle_id
  LEFT JOIN LATERAL (
    SELECT b.id, b.route, b.status
    FROM public.bookings b
    WHERE b.driver_id = f.sub_driver_id
      AND b.status IN ('pending', 'accepted', 'in_progress')
    ORDER BY b.updated_at DESC
    LIMIT 1
  ) ab ON true
  WHERE f.host_driver_id = p_host_driver_id
    AND f.sub_driver_id = p_sub_driver_id
    AND f.status IN ('pending', 'accepted')
    AND auth.uid() = p_host_driver_id
    AND EXISTS (
      SELECT 1
      FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role = 'driver'
    );
$$;

REVOKE ALL ON FUNCTION public.get_fleet_member_profile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fleet_member_profile(uuid, uuid) TO authenticated, service_role;

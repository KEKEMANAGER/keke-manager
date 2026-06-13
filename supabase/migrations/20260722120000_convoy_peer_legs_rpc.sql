-- Convoy leg summaries for participants: company sees all prices; each driver only their own.

CREATE OR REPLACE FUNCTION public.fetch_convoy_legs_for_participant(p_master_id uuid)
RETURNS TABLE (
  leg_booking_id uuid,
  leg_index int,
  vehicle_type text,
  vehicle_class text,
  passengers int,
  driver_id uuid,
  leg_status text,
  price_gel numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_master_id IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_convoy_participant(p_master_id, auth.uid())
     AND NOT public.is_admin_user() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    leg.id,
    COALESCE(leg.leg_index, 0),
    leg.vehicle_type,
    leg.vehicle_class,
    leg.passengers,
    leg.driver_id,
    leg.status::text,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.bookings m
        WHERE m.id = p_master_id
          AND m.company_id::text = auth.uid()::text
      )
      OR public.is_admin_user()
      THEN leg.price_gel
      WHEN leg.driver_id IS NOT NULL
        AND leg.driver_id::text = auth.uid()::text
      THEN leg.price_gel
      ELSE NULL
    END
  FROM public.bookings leg
  WHERE leg.parent_booking_id = p_master_id
  ORDER BY COALESCE(leg.leg_index, 0) ASC, leg.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.fetch_convoy_legs_for_participant(uuid) IS
  'Convoy leg rows for voucher/chat: prices visible to company (all) or assigned driver (own leg only).';

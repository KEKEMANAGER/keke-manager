-- One company rating per booking. Remove duplicates first, then enforce uniqueness.

DELETE FROM public.ratings r
WHERE r.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, booking_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.ratings
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ratings_company_booking_unique
  ON public.ratings (company_id, booking_id);

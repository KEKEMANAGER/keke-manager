-- Run in Supabase SQL Editor if unique index failed with error 23505.
-- Step 1: see duplicates (optional)
-- SELECT company_id, booking_id, COUNT(*) AS cnt
-- FROM public.ratings
-- GROUP BY company_id, booking_id
-- HAVING COUNT(*) > 1;

-- Step 2: keep newest rating per (company_id, booking_id), delete the rest
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

-- Step 3: create unique index
CREATE UNIQUE INDEX IF NOT EXISTS ratings_company_booking_unique
  ON public.ratings (company_id, booking_id);

-- Clerk IDs (e.g. user_...) are text, not Postgres uuid.
ALTER TABLE public.ratings
  ALTER COLUMN driver_id TYPE text USING (driver_id::text);

ALTER TABLE public.ratings
  ALTER COLUMN company_id TYPE text USING (company_id::text);

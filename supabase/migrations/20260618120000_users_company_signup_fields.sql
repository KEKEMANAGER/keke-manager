ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS company_phone text,
  ADD COLUMN IF NOT EXISTS company_id_code text,
  ADD COLUMN IF NOT EXISTS company_director text;

COMMENT ON COLUMN public.users.company_email IS 'Company contact email (sign-up)';
COMMENT ON COLUMN public.users.company_phone IS 'Company phone (sign-up)';
COMMENT ON COLUMN public.users.company_id_code IS 'Company identification code (sign-up)';
COMMENT ON COLUMN public.users.company_director IS 'Director / manager name (sign-up)';

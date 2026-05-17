-- Verification documents: front/back per document type.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS license_front text,
  ADD COLUMN IF NOT EXISTS license_back text,
  ADD COLUMN IF NOT EXISTS tech_passport_front text,
  ADD COLUMN IF NOT EXISTS tech_passport_back text,
  ADD COLUMN IF NOT EXISTS id_front text,
  ADD COLUMN IF NOT EXISTS id_back text;

COMMENT ON COLUMN public.users.license_front IS 'Driver license — front';
COMMENT ON COLUMN public.users.license_back IS 'Driver license — back';
COMMENT ON COLUMN public.users.tech_passport_front IS 'Vehicle tech passport — front (freelance)';
COMMENT ON COLUMN public.users.tech_passport_back IS 'Vehicle tech passport — back (freelance)';
COMMENT ON COLUMN public.users.id_front IS 'National ID — front';
COMMENT ON COLUMN public.users.id_back IS 'National ID — back';

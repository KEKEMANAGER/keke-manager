-- Add is_verified to profiles so notifications can filter unverified drivers
-- without a cross-table JOIN.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Back-fill from users table for existing verified drivers.
UPDATE public.profiles p
SET is_verified = true
FROM public.users u
WHERE u.id = p.id
  AND u.is_verified = true;

-- Hired driver job board (bio already exists on users).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS available_for_hire boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.available_for_hire IS
  'Hired drivers visible on host job board when true.';

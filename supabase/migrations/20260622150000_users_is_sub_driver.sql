-- Legacy: superseded by 20260622160000_users_is_hired_driver.sql (is_hired_driver).
-- Kept for migration history if already applied.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_sub_driver boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_sub_driver IS
  'Deprecated — use is_hired_driver.';

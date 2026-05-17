ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.is_blocked IS 'Admin block — user cannot use the app.';

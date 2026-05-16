-- If `profiles` was created manually or before migrations included this column,
-- PostgREST rejects updates that mention `updated_at`. The app no longer sends it,
-- but the column is useful for audits and future triggers.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

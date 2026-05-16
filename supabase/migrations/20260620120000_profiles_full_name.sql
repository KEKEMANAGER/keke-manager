-- Optional display name on driver profiles (synced from users when available).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

UPDATE public.profiles p
SET full_name = u.full_name
FROM public.users u
WHERE u.id = p.id::text
  AND u.full_name IS NOT NULL
  AND trim(u.full_name) <> '';

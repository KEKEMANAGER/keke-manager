-- Driver avatar public URL (storage bucket `media`, path avatars/{user_id}.jpg)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Public URL in storage bucket media (avatars/...)';

UPDATE public.profiles p
SET avatar_url = u.avatar_url
FROM public.users u
WHERE p.id = u.id
  AND u.avatar_url IS NOT NULL
  AND trim(u.avatar_url) <> ''
  AND (p.avatar_url IS NULL OR trim(p.avatar_url) = '');

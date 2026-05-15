-- Driver preferences + push tokens (id = auth.users.id).
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  vehicle_type text,
  vehicle_class text,
  push_token text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_vehicle_match_idx
  ON public.profiles (vehicle_type, vehicle_class)
  WHERE push_token IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_authenticated_select" ON public.profiles;
CREATE POLICY "profiles_authenticated_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_authenticated_insert" ON public.profiles;
CREATE POLICY "profiles_authenticated_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_authenticated_update" ON public.profiles;
CREATE POLICY "profiles_authenticated_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_anon_select" ON public.profiles;
CREATE POLICY "profiles_anon_select" ON public.profiles
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "profiles_anon_upsert" ON public.profiles;
CREATE POLICY "profiles_anon_insert" ON public.profiles
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "profiles_anon_update" ON public.profiles;
CREATE POLICY "profiles_anon_update" ON public.profiles
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;

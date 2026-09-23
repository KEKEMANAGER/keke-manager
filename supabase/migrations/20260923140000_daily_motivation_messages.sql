-- Admin-published daily motivational messages, shown as a once-per-day popup to
-- company and driver users. Mirrors the existing public.ads table's shape/RLS pattern.

CREATE TABLE IF NOT EXISTS public.daily_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS daily_messages_active_created_idx
  ON public.daily_messages (is_active, created_at DESC);

ALTER TABLE public.daily_messages ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read active messages (app shows only the latest one)
DROP POLICY IF EXISTS "daily_messages_authenticated_select_active" ON public.daily_messages;
CREATE POLICY "daily_messages_authenticated_select_active" ON public.daily_messages
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Admin: full CRUD (including seeing inactive/past messages in the admin panel)
DROP POLICY IF EXISTS "daily_messages_admin_select" ON public.daily_messages;
CREATE POLICY "daily_messages_admin_select" ON public.daily_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "daily_messages_admin_insert" ON public.daily_messages;
CREATE POLICY "daily_messages_admin_insert" ON public.daily_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "daily_messages_admin_update" ON public.daily_messages;
CREATE POLICY "daily_messages_admin_update" ON public.daily_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "daily_messages_admin_delete" ON public.daily_messages;
CREATE POLICY "daily_messages_admin_delete" ON public.daily_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

GRANT SELECT ON public.daily_messages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.daily_messages TO authenticated;

-- Prevent authenticated users from inserting notifications for other accounts.
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;
CREATE POLICY "notifications_insert_authenticated" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

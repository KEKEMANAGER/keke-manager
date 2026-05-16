-- User-submitted feedback (Supabase Auth `authenticated`; `user_id` = auth.uid()).

CREATE TABLE IF NOT EXISTS public.feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message text NOT NULL CHECK (length(trim(message)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedbacks_message_length CHECK (char_length(message) <= 4000)
);

CREATE INDEX IF NOT EXISTS feedbacks_user_id_created_at_idx
  ON public.feedbacks (user_id, created_at DESC);

ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedbacks_authenticated_insert" ON public.feedbacks;
CREATE POLICY "feedbacks_authenticated_insert" ON public.feedbacks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT INSERT ON public.feedbacks TO authenticated;

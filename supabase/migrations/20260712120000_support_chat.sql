-- Direct support chat: user ↔ KEKE admin (thread_type = support, no booking)

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_thread_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_thread_type_check
  CHECK (
    thread_type IS NULL
    OR thread_type IN (
      'company_host',
      'company_driver',
      'host_driver',
      'support'
    )
  );

CREATE INDEX IF NOT EXISTS messages_support_thread_idx
  ON public.messages (thread_type, created_at DESC)
  WHERE thread_type = 'support';

CREATE INDEX IF NOT EXISTS messages_support_participants_idx
  ON public.messages (sender_id, receiver_id, created_at DESC)
  WHERE thread_type = 'support';

COMMENT ON COLUMN public.messages.thread_type IS
  'company_host | company_driver | host_driver | support';

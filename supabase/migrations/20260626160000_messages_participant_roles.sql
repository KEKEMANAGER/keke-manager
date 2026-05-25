-- Three-party booking chat: company ↔ host, company ↔ driver, host ↔ driver

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS thread_type text,
  ADD COLUMN IF NOT EXISTS sender_participant_role text,
  ADD COLUMN IF NOT EXISTS receiver_participant_role text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_thread_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_thread_type_check
  CHECK (
    thread_type IS NULL
    OR thread_type IN ('company_host', 'company_driver', 'host_driver')
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_sender_participant_role_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_sender_participant_role_check
  CHECK (
    sender_participant_role IS NULL
    OR sender_participant_role IN ('company', 'host', 'driver')
  );

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_receiver_participant_role_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_receiver_participant_role_check
  CHECK (
    receiver_participant_role IS NULL
    OR receiver_participant_role IN ('company', 'host', 'driver')
  );

CREATE INDEX IF NOT EXISTS messages_booking_thread_idx
  ON public.messages (booking_id, thread_type, created_at DESC)
  WHERE booking_id IS NOT NULL AND thread_type IS NOT NULL;

COMMENT ON COLUMN public.messages.thread_type IS 'company_host | company_driver | host_driver';
COMMENT ON COLUMN public.messages.sender_participant_role IS 'company | host | driver';
COMMENT ON COLUMN public.messages.receiver_participant_role IS 'company | host | driver';


ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS "references" TEXT,
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS raw_headers JSONB,
  ADD COLUMN IF NOT EXISTS is_replied BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_outbound BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_account_message_id_idx
  ON public.inbox_messages (account_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inbox_messages_thread_idx
  ON public.inbox_messages (account_id, thread_id);

ALTER TABLE public.inbox_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inbox_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
  END IF;
END $$;

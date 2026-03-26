
ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS last_synced_uid bigint NOT NULL DEFAULT 0;

ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS message_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_account_uid_unique ON public.inbox_messages (account_id, message_uid) WHERE message_uid IS NOT NULL;

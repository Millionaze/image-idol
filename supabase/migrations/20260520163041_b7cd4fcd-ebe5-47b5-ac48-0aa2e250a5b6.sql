
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_hash_active ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own api keys"
  ON public.api_keys FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own api keys"
  ON public.api_keys FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own api keys"
  ON public.api_keys FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own api keys"
  ON public.api_keys FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access api keys"
  ON public.api_keys FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

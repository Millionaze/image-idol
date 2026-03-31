
-- Add new columns to email_accounts
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS warmup_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_reply_length text NOT NULL DEFAULT 'medium';

-- warmup_threads: conversation threading state
CREATE TABLE public.warmup_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_a uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  account_b uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  thread_id text UNIQUE NOT NULL,
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  next_reply_by uuid REFERENCES public.email_accounts(id),
  next_reply_at timestamptz,
  previous_message_summary text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warmup_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on warmup_threads" ON public.warmup_threads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own warmup_threads" ON public.warmup_threads FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.email_accounts ea WHERE (ea.id = warmup_threads.account_a OR ea.id = warmup_threads.account_b) AND ea.user_id = auth.uid())
  );

-- warmup_content_log: content deduplication
CREATE TABLE public.warmup_content_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  subject_hash text NOT NULL,
  body_hash text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warmup_content_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on warmup_content_log" ON public.warmup_content_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own warmup_content_log" ON public.warmup_content_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.email_accounts ea WHERE ea.id = warmup_content_log.account_id AND ea.user_id = auth.uid()));

-- warmup_rescues: spam rescue tracking
CREATE TABLE public.warmup_rescues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sending_account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  receiving_account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  message_id text,
  landed_in_spam_at timestamptz,
  rescued_at timestamptz,
  rescue_success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warmup_rescues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on warmup_rescues" ON public.warmup_rescues FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own warmup_rescues" ON public.warmup_rescues FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.email_accounts ea WHERE (ea.id = warmup_rescues.sending_account_id OR ea.id = warmup_rescues.receiving_account_id) AND ea.user_id = auth.uid())
  );

-- warmup_partnerships: network diversity
CREATE TABLE public.warmup_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  partner_account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'custom',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  daily_interaction_count integer NOT NULL DEFAULT 0,
  last_interaction_date date
);
ALTER TABLE public.warmup_partnerships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on warmup_partnerships" ON public.warmup_partnerships FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own warmup_partnerships" ON public.warmup_partnerships FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.email_accounts ea WHERE (ea.id = warmup_partnerships.account_id OR ea.id = warmup_partnerships.partner_account_id) AND ea.user_id = auth.uid()));

-- warmup_scores: readiness score history
CREATE TABLE public.warmup_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  gmail_score integer NOT NULL DEFAULT 0,
  outlook_score integer NOT NULL DEFAULT 0,
  reply_score integer NOT NULL DEFAULT 0,
  rescue_score integer NOT NULL DEFAULT 0,
  dns_score integer NOT NULL DEFAULT 0,
  age_score integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warmup_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on warmup_scores" ON public.warmup_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view own warmup_scores" ON public.warmup_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.email_accounts ea WHERE ea.id = warmup_scores.account_id AND ea.user_id = auth.uid()));

-- dns_health_log: DNS monitoring history
CREATE TABLE public.dns_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  spf_status boolean NOT NULL DEFAULT false,
  dkim_status boolean NOT NULL DEFAULT false,
  dmarc_status boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  changed_from jsonb,
  changed_to jsonb
);
ALTER TABLE public.dns_health_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on dns_health_log" ON public.dns_health_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can view dns_health_log" ON public.dns_health_log FOR SELECT TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX idx_warmup_threads_accounts ON public.warmup_threads(account_a, account_b);
CREATE INDEX idx_warmup_threads_status ON public.warmup_threads(status);
CREATE INDEX idx_warmup_threads_next_reply ON public.warmup_threads(next_reply_at) WHERE status = 'open';
CREATE INDEX idx_warmup_content_log_account ON public.warmup_content_log(account_id);
CREATE INDEX idx_warmup_content_log_hashes ON public.warmup_content_log(account_id, subject_hash, body_hash);
CREATE INDEX idx_warmup_rescues_accounts ON public.warmup_rescues(receiving_account_id, created_at);
CREATE INDEX idx_warmup_partnerships_active ON public.warmup_partnerships(account_id, expires_at);
CREATE INDEX idx_warmup_scores_account ON public.warmup_scores(account_id, calculated_at DESC);
CREATE INDEX idx_dns_health_log_domain ON public.dns_health_log(domain, checked_at DESC);


-- Enum for sequence conditions
CREATE TYPE public.sequence_condition AS ENUM ('no_open', 'open_no_reply', 'link_click', 'always');

-- 1. campaign_sequences
CREATE TABLE public.campaign_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number integer NOT NULL DEFAULT 1,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  delay_days integer NOT NULL DEFAULT 1,
  condition_type public.sequence_condition NOT NULL DEFAULT 'always',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own campaign sequences" ON public.campaign_sequences FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_sequences.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_sequences.campaign_id AND c.user_id = auth.uid()));

-- 2. list_cleaning_jobs
CREATE TABLE public.list_cleaning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text NOT NULL DEFAULT '',
  total_emails integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  risky_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  disposable_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.list_cleaning_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own list cleaning jobs" ON public.list_cleaning_jobs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. list_cleaning_results
CREATE TABLE public.list_cleaning_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.list_cleaning_jobs(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.list_cleaning_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own list cleaning results" ON public.list_cleaning_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM list_cleaning_jobs j WHERE j.id = list_cleaning_results.job_id AND j.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM list_cleaning_jobs j WHERE j.id = list_cleaning_results.job_id AND j.user_id = auth.uid()));

-- 4. copy_history
CREATE TABLE public.copy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_context text,
  audience text,
  goal text,
  tone text,
  pain_point text,
  variation_a jsonb,
  variation_b jsonb,
  variation_c jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.copy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own copy history" ON public.copy_history FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. subject_tests
CREATE TABLE public.subject_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_line text NOT NULL,
  spam_score integer DEFAULT 0,
  predicted_open_rate text,
  suggestions jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subject_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own subject tests" ON public.subject_tests FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. send_plans
CREATE TABLE public.send_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  recommended_day text,
  recommended_time text,
  timezone text,
  industry text,
  heatmap_data jsonb,
  analysis jsonb,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.send_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own send plans" ON public.send_plans FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. audit_reports
CREATE TABLE public.audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  domain text NOT NULL,
  dns_score integer DEFAULT 0,
  blacklist_score integer DEFAULT 0,
  infrastructure_score integer DEFAULT 0,
  content_score integer DEFAULT 0,
  engagement_score integer DEFAULT 0,
  total_score integer DEFAULT 0,
  grade text DEFAULT 'F',
  details jsonb,
  fixes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own audit reports" ON public.audit_reports FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. spintax_templates
CREATE TABLE public.spintax_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  raw_content text,
  spintax_content text,
  variation_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spintax_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own spintax templates" ON public.spintax_templates FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Modify campaigns table
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS paused_reason text,
  ADD COLUMN IF NOT EXISTS spam_complaint_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribe_count integer NOT NULL DEFAULT 0;

-- Modify contact_sequence_state table
ALTER TABLE public.contact_sequence_state
  ADD COLUMN IF NOT EXISTS last_action text,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_send_at timestamptz;

-- Create storage bucket for email list uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('email-lists', 'email-lists', false);
CREATE POLICY "Users can upload their own email lists" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-lists' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can read their own email lists" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'email-lists' AND (storage.foldername(name))[1] = auth.uid()::text);

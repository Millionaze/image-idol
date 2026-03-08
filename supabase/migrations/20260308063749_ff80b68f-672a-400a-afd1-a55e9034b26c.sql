
-- New enum for sequence state
CREATE TYPE public.sequence_state_status AS ENUM ('active', 'completed', 'paused');

-- Add new values to warmup_log_type
ALTER TYPE public.warmup_log_type ADD VALUE IF NOT EXISTS 'marked_important';
ALTER TYPE public.warmup_log_type ADD VALUE IF NOT EXISTS 'rescued_from_spam';

-- Add new value to contact_status
ALTER TYPE public.contact_status ADD VALUE IF NOT EXISTS 'replied';

-- New columns on email_accounts
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS warmup_ramp_day integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warmup_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_weekdays_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mark_important_rate integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS spam_rescue_rate integer NOT NULL DEFAULT 20;

-- New column on campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS is_sequence boolean NOT NULL DEFAULT false;

-- Settings table
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  tracking_domain text,
  tracking_domain_verified boolean NOT NULL DEFAULT false,
  ai_warmup_enabled boolean NOT NULL DEFAULT false,
  seed_gmail text,
  seed_outlook text,
  seed_custom text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON public.settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Blacklist checks table
CREATE TABLE public.blacklist_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.email_accounts(id) ON DELETE CASCADE NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  is_clean boolean NOT NULL DEFAULT true,
  listed_on text[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.blacklist_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own blacklist checks" ON public.blacklist_checks FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = blacklist_checks.account_id AND ea.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = blacklist_checks.account_id AND ea.user_id = auth.uid()));

-- Sequence steps table
CREATE TABLE public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  step_number integer NOT NULL DEFAULT 1,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  delay_days integer NOT NULL DEFAULT 1,
  delay_hours integer NOT NULL DEFAULT 0
);
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sequence steps" ON public.sequence_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = sequence_steps.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = sequence_steps.campaign_id AND c.user_id = auth.uid()));

-- Contact sequence state table
CREATE TABLE public.contact_sequence_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  current_step integer NOT NULL DEFAULT 1,
  next_send_at timestamptz,
  status sequence_state_status NOT NULL DEFAULT 'active'
);
ALTER TABLE public.contact_sequence_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own contact sequence state" ON public.contact_sequence_state FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = contact_sequence_state.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = contact_sequence_state.campaign_id AND c.user_id = auth.uid()));

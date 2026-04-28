
-- ============================================================
-- WORKFLOW & PIPELINE ENGINE — FOUNDATION MIGRATION
-- ============================================================

-- ---------- 1. TAGS ----------
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gray',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.contact_tags (
  contact_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by_workflow_id uuid NULL,
  PRIMARY KEY (contact_id, tag_id)
);
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_tags" ON public.contact_tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tags t WHERE t.id = contact_tags.tag_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tags t WHERE t.id = contact_tags.tag_id AND t.user_id = auth.uid()));
CREATE INDEX idx_contact_tags_contact ON public.contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag ON public.contact_tags(tag_id);

-- ---------- 2. CUSTOM FIELDS ----------
CREATE TABLE public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number','date','boolean','select','url')),
  options jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own custom fields" ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.contact_custom_values (
  contact_id uuid NOT NULL,
  field_id uuid NOT NULL,
  value_text text NULL,
  value_number numeric NULL,
  value_date timestamptz NULL,
  value_boolean boolean NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, field_id)
);
ALTER TABLE public.contact_custom_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact custom values" ON public.contact_custom_values
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.custom_field_definitions f WHERE f.id = contact_custom_values.field_id AND f.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.custom_field_definitions f WHERE f.id = contact_custom_values.field_id AND f.user_id = auth.uid()));

-- ---------- 3. PIPELINES ----------
CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text NULL,
  is_default boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pipelines" ON public.pipelines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gray',
  position int NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pipeline stages" ON public.pipeline_stages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stages.pipeline_id AND p.user_id = auth.uid()));
CREATE INDEX idx_pipeline_stages_pipeline ON public.pipeline_stages(pipeline_id, position);

ALTER TABLE public.contacts ADD COLUMN pipeline_id uuid NULL;
ALTER TABLE public.contacts ADD COLUMN pipeline_stage_id uuid NULL;
ALTER TABLE public.contacts ADD COLUMN pipeline_entered_at timestamptz NULL;
ALTER TABLE public.contacts ADD COLUMN pipeline_stage_entered_at timestamptz NULL;
CREATE INDEX idx_contacts_pipeline_stage ON public.contacts(pipeline_stage_id);

CREATE TABLE public.pipeline_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  from_stage_id uuid NULL,
  to_stage_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text NOT NULL DEFAULT 'system',
  workflow_run_id uuid NULL
);
ALTER TABLE public.pipeline_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own stage history" ON public.pipeline_stage_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pipelines p WHERE p.id = pipeline_stage_history.pipeline_id AND p.user_id = auth.uid()));
CREATE POLICY "Service role full access stage history" ON public.pipeline_stage_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_stage_history_contact ON public.pipeline_stage_history(contact_id, changed_at DESC);

-- ---------- 4. WORKFLOWS ----------
CREATE TABLE public.workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  exit_conditions jsonb NOT NULL DEFAULT '[]',
  graph jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  stats jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own workflows" ON public.workflows
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_workflows_active ON public.workflows(status) WHERE status = 'active';

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','exited','failed','paused')),
  current_node_id text NULL,
  context jsonb NOT NULL DEFAULT '{}',
  triggered_by jsonb NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  next_action_at timestamptz NULL,
  error text NULL,
  UNIQUE (workflow_id, contact_id)
);
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own workflow runs" ON public.workflow_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_runs.workflow_id AND w.user_id = auth.uid()));
CREATE POLICY "Service role full access runs" ON public.workflow_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_runs_pending ON public.workflow_runs(status, next_action_at) WHERE status = 'running';
CREATE INDEX idx_runs_paused ON public.workflow_runs(status, current_node_id) WHERE status = 'paused';

CREATE TABLE public.workflow_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  node_id text NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','completed','failed','skipped')),
  result jsonb NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  duration_ms int NULL
);
ALTER TABLE public.workflow_run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own run logs" ON public.workflow_run_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_runs r
    JOIN public.workflows w ON w.id = r.workflow_id
    WHERE r.id = workflow_run_log.run_id AND w.user_id = auth.uid()
  ));
CREATE POLICY "Service role full access run logs" ON public.workflow_run_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_run_log_run ON public.workflow_run_log(run_id, executed_at DESC);

-- ---------- 5. EVENTS BUS ----------
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NULL,
  event_type text NOT NULL,
  source jsonb NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','processed','failed')),
  error text NULL
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own events" ON public.events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access events" ON public.events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_events_pending ON public.events(processing_status, occurred_at) WHERE processing_status = 'pending';
CREATE INDEX idx_events_contact_lookup ON public.events(contact_id, event_type, occurred_at DESC);

CREATE TABLE public.event_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NULL,
  event_type text NOT NULL,
  payload jsonb NULL,
  error text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_dlq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access dlq" ON public.event_dlq
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 6. WEBHOOKS ----------
CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  url text NOT NULL,
  secret text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own webhooks" ON public.webhook_endpoints
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_webhook_inbound_url ON public.webhook_endpoints(url) WHERE direction = 'inbound';

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL,
  direction text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  response_status int NULL,
  response_body text NULL,
  attempt int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  delivered_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own webhook deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webhook_endpoints e WHERE e.id = webhook_deliveries.endpoint_id AND e.user_id = auth.uid()));
CREATE POLICY "Service role full access deliveries" ON public.webhook_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- 7. STAGE-CHANGE TRIGGER ----------
CREATE OR REPLACE FUNCTION public.handle_pipeline_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id AND NEW.pipeline_stage_id IS NOT NULL THEN
    NEW.pipeline_stage_entered_at := now();
    IF OLD.pipeline_stage_id IS NULL THEN
      NEW.pipeline_entered_at := now();
    END IF;

    SELECT c.user_id INTO v_user_id FROM public.campaigns c WHERE c.id = NEW.campaign_id;

    INSERT INTO public.pipeline_stage_history (contact_id, pipeline_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, NEW.pipeline_id, OLD.pipeline_stage_id, NEW.pipeline_stage_id, 'system');

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.events (user_id, contact_id, event_type, source, payload)
      VALUES (
        v_user_id, NEW.id, 'stage.changed',
        jsonb_build_object('pipeline_id', NEW.pipeline_id),
        jsonb_build_object('from_stage_id', OLD.pipeline_stage_id, 'to_stage_id', NEW.pipeline_stage_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pipeline_stage_change
BEFORE UPDATE OF pipeline_stage_id ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.handle_pipeline_stage_change();

-- ---------- 8. SEED HELPER FOR USERS ----------
CREATE OR REPLACE FUNCTION public.seed_workflow_defaults_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
BEGIN
  -- Default pipeline (skip if user already has one)
  IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE user_id = p_user_id) THEN
    INSERT INTO public.pipelines (user_id, name, is_default)
    VALUES (p_user_id, 'Default', true)
    RETURNING id INTO v_pipeline_id;

    INSERT INTO public.pipeline_stages (pipeline_id, name, color, position, is_won, is_lost) VALUES
      (v_pipeline_id, 'New Lead', 'gray', 0, false, false),
      (v_pipeline_id, 'Engaged', 'blue', 1, false, false),
      (v_pipeline_id, 'Interested', 'yellow', 2, false, false),
      (v_pipeline_id, 'Qualified', 'orange', 3, false, false),
      (v_pipeline_id, 'Closed Won', 'green', 4, true, false),
      (v_pipeline_id, 'Closed Lost', 'red', 5, false, true);
  END IF;

  -- Default tags
  INSERT INTO public.tags (user_id, name, color) VALUES
    (p_user_id, 'interested', 'green'),
    (p_user_id, 'not_interested', 'red'),
    (p_user_id, 'bounced', 'orange'),
    (p_user_id, 'unsubscribed', 'gray'),
    (p_user_id, 'replied', 'blue')
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Default custom fields
  INSERT INTO public.custom_field_definitions (user_id, key, label, field_type, options) VALUES
    (p_user_id, 'industry', 'Industry', 'text', NULL),
    (p_user_id, 'company_size', 'Company Size', 'select', '["1-10","11-50","51-200","200+"]'::jsonb),
    (p_user_id, 'last_contacted', 'Last Contacted', 'date', NULL)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;

-- Update handle_new_user to seed defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  PERFORM public.seed_workflow_defaults_for_user(NEW.id);
  RETURN NEW;
END;
$$;

-- Backfill for existing users
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM auth.users LOOP
    PERFORM public.seed_workflow_defaults_for_user(r.id);
  END LOOP;
END $$;

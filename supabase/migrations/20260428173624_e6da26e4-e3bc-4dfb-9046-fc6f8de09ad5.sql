-- ============================================================
-- 1. Defensive cleanup: remove duplicates and orphans
-- ============================================================

-- Dedup contact_tags (keep earliest added_at)
DELETE FROM public.contact_tags a
USING public.contact_tags b
WHERE a.ctid < b.ctid
  AND a.contact_id = b.contact_id
  AND a.tag_id = b.tag_id;

-- Dedup contact_custom_values
DELETE FROM public.contact_custom_values a
USING public.contact_custom_values b
WHERE a.ctid < b.ctid
  AND a.contact_id = b.contact_id
  AND a.field_id = b.field_id;

-- Null out orphan references defensively
UPDATE public.contacts SET pipeline_id = NULL
  WHERE pipeline_id IS NOT NULL AND pipeline_id NOT IN (SELECT id FROM public.pipelines);
UPDATE public.contacts SET pipeline_stage_id = NULL
  WHERE pipeline_stage_id IS NOT NULL AND pipeline_stage_id NOT IN (SELECT id FROM public.pipeline_stages);
UPDATE public.events SET contact_id = NULL
  WHERE contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM public.contacts);

-- Delete orphan child rows
DELETE FROM public.contact_tags WHERE contact_id NOT IN (SELECT id FROM public.contacts) OR tag_id NOT IN (SELECT id FROM public.tags);
DELETE FROM public.contact_custom_values WHERE contact_id NOT IN (SELECT id FROM public.contacts) OR field_id NOT IN (SELECT id FROM public.custom_field_definitions);
DELETE FROM public.pipeline_stages WHERE pipeline_id NOT IN (SELECT id FROM public.pipelines);
DELETE FROM public.pipeline_stage_history WHERE contact_id NOT IN (SELECT id FROM public.contacts) OR pipeline_id NOT IN (SELECT id FROM public.pipelines);
UPDATE public.pipeline_stage_history SET from_stage_id = NULL WHERE from_stage_id IS NOT NULL AND from_stage_id NOT IN (SELECT id FROM public.pipeline_stages);
UPDATE public.pipeline_stage_history SET to_stage_id = NULL WHERE to_stage_id IS NOT NULL AND to_stage_id NOT IN (SELECT id FROM public.pipeline_stages);
UPDATE public.pipeline_stage_history SET workflow_run_id = NULL WHERE workflow_run_id IS NOT NULL AND workflow_run_id NOT IN (SELECT id FROM public.workflow_runs);
DELETE FROM public.workflow_runs WHERE workflow_id NOT IN (SELECT id FROM public.workflows) OR contact_id NOT IN (SELECT id FROM public.contacts);
DELETE FROM public.workflow_run_log WHERE run_id NOT IN (SELECT id FROM public.workflow_runs);
DELETE FROM public.webhook_deliveries WHERE endpoint_id NOT IN (SELECT id FROM public.webhook_endpoints);
UPDATE public.contact_tags SET added_by_workflow_id = NULL WHERE added_by_workflow_id IS NOT NULL AND added_by_workflow_id NOT IN (SELECT id FROM public.workflows);

-- ============================================================
-- 2. Composite primary keys on join tables
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (contact_id, tag_id);
EXCEPTION WHEN invalid_table_definition OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.contact_custom_values ADD CONSTRAINT contact_custom_values_pkey PRIMARY KEY (contact_id, field_id);
EXCEPTION WHEN invalid_table_definition OR duplicate_table THEN NULL; END $$;

-- ============================================================
-- 3. Foreign keys (idempotent via DO blocks)
-- ============================================================
DO $$ BEGIN ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_contact_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.contact_tags ADD CONSTRAINT contact_tags_workflow_fk FOREIGN KEY (added_by_workflow_id) REFERENCES public.workflows(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.contact_custom_values ADD CONSTRAINT contact_custom_values_contact_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.contact_custom_values ADD CONSTRAINT contact_custom_values_field_fk FOREIGN KEY (field_id) REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_pipeline_fk FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.pipeline_stage_history ADD CONSTRAINT psh_contact_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.pipeline_stage_history ADD CONSTRAINT psh_pipeline_fk FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.pipeline_stage_history ADD CONSTRAINT psh_from_stage_fk FOREIGN KEY (from_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.pipeline_stage_history ADD CONSTRAINT psh_to_stage_fk FOREIGN KEY (to_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.pipeline_stage_history ADD CONSTRAINT psh_run_fk FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.workflow_runs ADD CONSTRAINT workflow_runs_workflow_fk FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.workflow_runs ADD CONSTRAINT workflow_runs_contact_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.workflow_run_log ADD CONSTRAINT workflow_run_log_run_fk FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.webhook_deliveries ADD CONSTRAINT webhook_deliveries_endpoint_fk FOREIGN KEY (endpoint_id) REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.events ADD CONSTRAINT events_contact_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_fk FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.contacts ADD CONSTRAINT contacts_pipeline_stage_fk FOREIGN KEY (pipeline_stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
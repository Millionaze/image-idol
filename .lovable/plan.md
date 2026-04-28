## Backend Audit — Remediation Plan

The audit passed 11/14 checks. Three gaps need fixing before building UI on top.

### 1. Migration: add missing PRIMARY KEYs and FOREIGN KEYs

Run a single migration that adds the integrity constraints Lovable's first migration omitted.

**Composite primary keys** (currently missing → duplicates possible, breaks `ON CONFLICT`):
- `contact_tags` → PK `(contact_id, tag_id)`
- `contact_custom_values` → PK `(contact_id, field_id)`

**Foreign keys with ON DELETE CASCADE** (currently missing → orphan rows):

| Table | Column | References | On Delete |
|---|---|---|---|
| contact_tags | contact_id | contacts(id) | CASCADE |
| contact_tags | tag_id | tags(id) | CASCADE |
| contact_tags | added_by_workflow_id | workflows(id) | SET NULL |
| contact_custom_values | contact_id | contacts(id) | CASCADE |
| contact_custom_values | field_id | custom_field_definitions(id) | CASCADE |
| pipeline_stages | pipeline_id | pipelines(id) | CASCADE |
| pipeline_stage_history | contact_id | contacts(id) | CASCADE |
| pipeline_stage_history | pipeline_id | pipelines(id) | CASCADE |
| pipeline_stage_history | from_stage_id | pipeline_stages(id) | SET NULL |
| pipeline_stage_history | to_stage_id | pipeline_stages(id) | SET NULL |
| pipeline_stage_history | workflow_run_id | workflow_runs(id) | SET NULL |
| workflow_runs | workflow_id | workflows(id) | CASCADE |
| workflow_runs | contact_id | contacts(id) | CASCADE |
| workflow_run_log | run_id | workflow_runs(id) | CASCADE |
| webhook_deliveries | endpoint_id | webhook_endpoints(id) | CASCADE |
| events | contact_id | contacts(id) | SET NULL |
| contacts | pipeline_id | pipelines(id) | SET NULL |
| contacts | pipeline_stage_id | pipeline_stages(id) | SET NULL |

The migration will:
1. De-duplicate `contact_tags` and `contact_custom_values` rows defensively before adding the PKs (using `DISTINCT ON`).
2. Null out any orphan `contact_id` / `pipeline_id` / etc. references defensively before adding FKs (so the migration can't fail mid-flight).
3. Add the PK and FK constraints with `IF NOT EXISTS` patterns where supported (use `DO $$ ... EXCEPTION WHEN duplicate_object` for FKs).

### 2. Run E2E smoke test from Step 5 of the audit

After the migration applies, I will execute the smoke-test SQL via the read/insert query tools using a real authenticated user_id (we have one already — taken from the most recent profile row). Sequence:

1. Insert test contact, test tag, test workflow with `add_tag` action and trigger `email.opened`.
2. Insert an `email.opened` event for that contact.
3. Wait 70s (cron fires every minute, paired jobs effectively 30s).
4. Verify: event `processing_status='processed'`, a `workflow_runs` row exists with `status='completed'`, the contact has the tag, and `workflow_run_log` has 2–3 rows.
5. Clean up all test data.

If the smoke test fails, drop into edge-function logs for `workflow-event-processor` and `workflow-runner` to diagnose, then patch the function.

### 3. Skip — already passing

Steps 1–4, 6, and the merge-tag check (Step 7) either passed in the static audit or require a real SMTP send (the merge-tag resolver code exists in `_shared/merge-tags.ts` and is unit-coverable separately; I won't burn an actual email send during audit).

### Deliverables

- 1 new migration file: `add_workflow_engine_constraints.sql`
- Smoke-test result summary posted in chat (event flowed, tag added, run completed) — or a list of failures with proposed fixes.

After this passes, the backend is truly ready and we can move on to the UI work that's already partially built.

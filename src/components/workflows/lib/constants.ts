// Mirror of the trigger types in supabase/functions/_shared/registries.ts (kept in sync manually)
export const TRIGGER_TYPES = [
  "campaign_started",
  "email_sent",
  "email_opened",
  "email_clicked",
  "email_replied",
  "email_bounced",
  "form_submitted",
  "tag_added",
  "tag_removed",
  "field_updated",
  "pipeline_stage_changed",
  "webhook_received",
  "manual_trigger",
  "contact_created",
] as const;

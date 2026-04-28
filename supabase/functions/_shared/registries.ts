// Shared trigger and action registries — adding a new type is one entry, no schema change.

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

export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const ACTION_TYPES = [
  "send_email",
  "send_sms",
  "add_tag",
  "remove_tag",
  "set_custom_field",
  "move_to_pipeline_stage",
  "start_workflow",
  "end_workflow",
  "exit_workflow",
  "fire_webhook",
  "assign_to_user",
  "wait_until_event",
  "ai_classify_reply",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const NODE_TYPES = [
  "entry",
  "exit",
  "action",
  "wait",
  "condition",
  "split",
  "goal",
] as const;

// Map event_type -> trigger config event_type (1:1 here)
export function eventToTrigger(eventType: string): TriggerType | null {
  const map: Record<string, TriggerType> = {
    "email.sent": "email_sent",
    "email.opened": "email_opened",
    "email.clicked": "email_clicked",
    "email.replied": "email_replied",
    "email.bounced": "email_bounced",
    "tag.added": "tag_added",
    "tag.removed": "tag_removed",
    "field.updated": "field_updated",
    "stage.changed": "pipeline_stage_changed",
    "webhook.received": "webhook_received",
    "manual.trigger": "manual_trigger",
    "contact.created": "contact_created",
    "campaign.started": "campaign_started",
    "form.submitted": "form_submitted",
  };
  return map[eventType] ?? null;
}

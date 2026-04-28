import { Mail, MessageSquare, Tag, TagsIcon, FileText, MoveRight, Timer, GitBranch, GitMerge, Workflow, Webhook, Sparkles, LogOut, Zap } from "lucide-react";

export type NodeKind = "trigger" | "action" | "wait" | "condition" | "split" | "goal" | "exit";

export interface NodeData {
  kind: NodeKind;
  label: string;
  // for action nodes
  action_type?: string;
  // free-form per-config
  config?: Record<string, any>;
}

export const ACTION_CATALOG: { category: string; items: { type: string; label: string; icon: any; kind: NodeKind }[] }[] = [
  {
    category: "Send",
    items: [
      { type: "send_email", label: "Send email", icon: Mail, kind: "action" },
      { type: "send_sms", label: "Send SMS", icon: MessageSquare, kind: "action" },
    ],
  },
  {
    category: "Update contact",
    items: [
      { type: "add_tag", label: "Add tag", icon: Tag, kind: "action" },
      { type: "remove_tag", label: "Remove tag", icon: TagsIcon, kind: "action" },
      { type: "set_custom_field", label: "Set custom field", icon: FileText, kind: "action" },
      { type: "move_to_pipeline_stage", label: "Move to stage", icon: MoveRight, kind: "action" },
    ],
  },
  {
    category: "Flow control",
    items: [
      { type: "wait", label: "Wait", icon: Timer, kind: "wait" },
      { type: "condition", label: "Condition", icon: GitBranch, kind: "condition" },
      { type: "split", label: "A/B split", icon: GitMerge, kind: "split" },
      { type: "start_workflow", label: "Start workflow", icon: Workflow, kind: "action" },
      { type: "exit_workflow", label: "Exit", icon: LogOut, kind: "exit" },
    ],
  },
  {
    category: "Integrations",
    items: [
      { type: "fire_webhook", label: "Fire webhook", icon: Webhook, kind: "action" },
      { type: "ai_classify_reply", label: "AI classify reply", icon: Sparkles, kind: "action" },
    ],
  },
];

export function iconForAction(type?: string) {
  for (const cat of ACTION_CATALOG) {
    const found = cat.items.find((i) => i.type === type);
    if (found) return found.icon;
  }
  return Zap;
}

export function labelForAction(type?: string) {
  for (const cat of ACTION_CATALOG) {
    const found = cat.items.find((i) => i.type === type);
    if (found) return found.label;
  }
  return type || "Action";
}

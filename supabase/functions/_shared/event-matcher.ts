// Decides whether an event matches a workflow's trigger config.

import { eventToTrigger } from "./registries.ts";

export interface EventRow {
  id: string;
  user_id: string;
  contact_id: string | null;
  event_type: string;
  source: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface WorkflowRow {
  id: string;
  user_id: string;
  status: string;
  trigger_config: {
    type?: string;
    filters?: Record<string, unknown>;
    re_enrollment?: "never" | "after_completion" | "always";
  };
}

function matchesFilters(
  filters: Record<string, unknown> | undefined,
  source: Record<string, unknown>,
  payload: Record<string, unknown>,
): boolean {
  if (!filters) return true;
  for (const [k, expected] of Object.entries(filters)) {
    if (expected === undefined || expected === null || expected === "") continue;
    // skip global filters here
    if (["tags_include", "tags_exclude", "pipeline_stage_id", "custom_field_match"].includes(k)) continue;
    const actual = source[k] ?? payload[k];
    if (actual === undefined || actual === null) return false;
    // Special: link_url supports object { op, value }
    if (k === "link_url" && typeof expected === "object") {
      const exp = expected as { op?: string; value?: string };
      const url = String(actual);
      const v = exp.value ?? "";
      if (exp.op === "contains") { if (!url.includes(v)) return false; }
      else if (exp.op === "regex") { if (!new RegExp(v).test(url)) return false; }
      else if (url !== v) return false;
      continue;
    }
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

export async function matchesGlobalFilters(
  supabase: any,
  filters: Record<string, unknown> | undefined,
  contactId: string | null,
): Promise<boolean> {
  if (!filters || !contactId) return true;
  const tagsInclude = filters.tags_include as string[] | undefined;
  const tagsExclude = filters.tags_exclude as string[] | undefined;
  const stageId = filters.pipeline_stage_id as string | undefined;

  if (stageId) {
    const { data: c } = await supabase.from("contacts").select("pipeline_stage_id").eq("id", contactId).maybeSingle();
    if (c?.pipeline_stage_id !== stageId) return false;
  }
  if (tagsInclude?.length || tagsExclude?.length) {
    const { data: tagRows } = await supabase
      .from("contact_tags")
      .select("tag_id")
      .eq("contact_id", contactId);
    const ids = new Set((tagRows ?? []).map((r: any) => r.tag_id));
    if (tagsInclude?.some((t) => !ids.has(t))) return false;
    if (tagsExclude?.some((t) => ids.has(t))) return false;
  }
  return true;
}

export async function findMatchingWorkflows(
  supabase: any,
  event: EventRow,
): Promise<WorkflowRow[]> {
  const triggerType = eventToTrigger(event.event_type);
  if (!triggerType) return [];

  const { data: workflows } = await supabase
    .from("workflows")
    .select("id,user_id,status,trigger_config")
    .eq("user_id", event.user_id)
    .eq("status", "active");

  const matches: WorkflowRow[] = [];
  for (const w of (workflows ?? []) as WorkflowRow[]) {
    if (w.trigger_config?.type !== triggerType) continue;
    if (!matchesFilters(w.trigger_config.filters, event.source, event.payload)) continue;
    if (!(await matchesGlobalFilters(supabase, w.trigger_config.filters, event.contact_id))) continue;
    matches.push(w);
  }
  return matches;
}

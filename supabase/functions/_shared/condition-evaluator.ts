// Evaluates condition-node rules against contact + tags + custom fields.

export type RuleOp = "eq" | "neq" | "contains" | "gt" | "lt" | "in" | "not_in" | "exists" | "not_exists";

export interface Rule {
  field: string; // "tag:<id>", "custom:<key>", "stage", "email", "company", etc.
  op: RuleOp;
  value?: unknown;
}

export interface ConditionConfig {
  mode?: "all" | "any";
  rules: Rule[];
}

async function resolveField(
  supabase: any,
  contactId: string,
  field: string,
): Promise<unknown> {
  if (field.startsWith("tag:")) {
    const tagId = field.slice(4);
    const { data } = await supabase.from("contact_tags").select("tag_id").eq("contact_id", contactId).eq("tag_id", tagId).maybeSingle();
    return data ? true : false;
  }
  if (field.startsWith("custom:")) {
    const key = field.slice(7);
    const { data } = await supabase
      .from("contact_custom_values")
      .select("value_text,value_number,value_date,value_boolean,custom_field_definitions!inner(key)")
      .eq("contact_id", contactId)
      .eq("custom_field_definitions.key", key)
      .maybeSingle();
    if (!data) return null;
    return data.value_text ?? data.value_number ?? data.value_date ?? data.value_boolean;
  }
  if (field === "stage") {
    const { data } = await supabase.from("contacts").select("pipeline_stage_id").eq("id", contactId).maybeSingle();
    return data?.pipeline_stage_id ?? null;
  }
  const { data } = await supabase.from("contacts").select(field).eq("id", contactId).maybeSingle();
  return (data as any)?.[field] ?? null;
}

function compare(actual: unknown, op: RuleOp, expected: unknown): boolean {
  switch (op) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "contains": return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "gt": return Number(actual) > Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "in": return Array.isArray(expected) && (expected as unknown[]).includes(actual);
    case "not_in": return Array.isArray(expected) && !(expected as unknown[]).includes(actual);
    case "exists": return actual !== null && actual !== undefined && actual !== "";
    case "not_exists": return actual === null || actual === undefined || actual === "";
  }
}

export async function evaluateCondition(
  supabase: any,
  contactId: string,
  cfg: ConditionConfig,
): Promise<boolean> {
  const mode = cfg.mode ?? "all";
  const results: boolean[] = [];
  for (const r of cfg.rules ?? []) {
    const actual = await resolveField(supabase, contactId, r.field);
    results.push(compare(actual, r.op, r.value));
  }
  if (results.length === 0) return true;
  return mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

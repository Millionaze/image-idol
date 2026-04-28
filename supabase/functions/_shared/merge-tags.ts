// Single merge-tag resolver used by every action handler.
// Supports {{first_name}}, {{last_name}}, {{email}}, {{company}}, {{phone}},
// {{custom.<key>}}, {{tags}}, {{stage}}, {{ctx.<key>}}, {{date}}, {{date+7d}}.

type Contact = {
  id: string;
  email: string;
  name?: string | null;
  [k: string]: unknown;
};

export interface MergeContext {
  contact: Contact;
  custom: Record<string, string>;
  tags: string[];
  stage?: string | null;
  ctx: Record<string, unknown>;
}

function splitName(name: string | null | undefined): [string, string] {
  if (!name) return ["", ""];
  const parts = name.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

function resolveDate(token: string): string {
  // token like "date" or "date+7d" / "date-3d"
  const m = token.match(/^date(?:([+-])(\d+)d)?$/);
  if (!m) return "";
  const sign = m[1] === "-" ? -1 : 1;
  const days = m[2] ? parseInt(m[2], 10) : 0;
  const d = new Date();
  d.setDate(d.getDate() + sign * days);
  return d.toISOString().split("T")[0];
}

export function renderTemplate(template: string, mc: MergeContext): string {
  if (!template) return "";
  const [first, last] = splitName(mc.contact.name as string | null);
  const base: Record<string, string> = {
    first_name: first || (mc.contact.email?.split("@")[0] ?? ""),
    last_name: last,
    email: mc.contact.email ?? "",
    company: (mc.contact["company"] as string) ?? "",
    phone: (mc.contact["phone"] as string) ?? "",
    tags: mc.tags.join(", "),
    stage: mc.stage ?? "",
  };

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_full, raw) => {
    const key = String(raw).trim();
    if (key.startsWith("custom.")) return mc.custom[key.slice(7)] ?? "";
    if (key.startsWith("ctx.")) {
      const v = mc.ctx[key.slice(4)];
      return v == null ? "" : String(v);
    }
    if (key === "date" || key.startsWith("date+") || key.startsWith("date-")) {
      return resolveDate(key);
    }
    if (key === "name") return base.first_name;
    return base[key] ?? "";
  });
}

export async function buildMergeContext(
  supabase: any,
  contactId: string,
  ctx: Record<string, unknown> = {},
): Promise<MergeContext> {
  const { data: contact } = await supabase.from("contacts").select("*").eq("id", contactId).single();

  const { data: tagRows } = await supabase
    .from("contact_tags")
    .select("tags(name)")
    .eq("contact_id", contactId);
  const tags = (tagRows ?? []).map((r: any) => r.tags?.name).filter(Boolean);

  const { data: customRows } = await supabase
    .from("contact_custom_values")
    .select("value_text,value_number,value_date,value_boolean,custom_field_definitions(key,field_type)")
    .eq("contact_id", contactId);
  const custom: Record<string, string> = {};
  for (const row of customRows ?? []) {
    const def = row.custom_field_definitions;
    if (!def?.key) continue;
    custom[def.key] =
      row.value_text ??
      (row.value_number != null ? String(row.value_number) : null) ??
      (row.value_date ? String(row.value_date).split("T")[0] : null) ??
      (row.value_boolean != null ? String(row.value_boolean) : null) ??
      "";
  }

  let stage: string | null = null;
  if (contact?.pipeline_stage_id) {
    const { data: s } = await supabase
      .from("pipeline_stages")
      .select("name")
      .eq("id", contact.pipeline_stage_id)
      .maybeSingle();
    stage = s?.name ?? null;
  }

  return { contact: contact ?? { id: contactId, email: "" }, tags, custom, stage, ctx };
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { TagPicker } from "@/components/shared/TagPicker";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { TRIGGER_TYPES } from "./lib/constants";
import type { Node } from "@xyflow/react";
import type { NodeData } from "./lib/catalog";

interface Props {
  node: Node | null;
  onClose: () => void;
  onChange: (id: string, data: NodeData) => void;
  onDelete: (id: string) => void;
}

export function NodeConfigSheet({ node, onClose, onChange, onDelete }: Props) {
  const [data, setData] = useState<NodeData | null>(null);
  useEffect(() => {
    setData(node ? ((node.data as unknown) as NodeData) : null);
  }, [node]);

  if (!node || !data) return null;

  const update = (patch: Partial<NodeData>) => {
    const next = { ...data, ...patch };
    setData(next);
    onChange(node.id, next);
  };
  const cfg = (patch: Record<string, any>) => {
    update({ config: { ...(data.config || {}), ...patch } });
  };

  return (
    <Sheet open={!!node} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="capitalize">{data.kind} {data.action_type ? `· ${data.action_type}` : ""}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div>
            <Label>Display label</Label>
            <Input
              className="h-9 mt-1"
              value={data.label || ""}
              onChange={(e) => update({ label: e.target.value })}
              placeholder="Shown on the node"
            />
          </div>

          {data.kind === "trigger" && <TriggerForm data={data} cfg={cfg} />}
          {data.kind === "action" && data.action_type === "send_email" && <SendEmailForm data={data} cfg={cfg} />}
          {data.kind === "action" && (data.action_type === "add_tag" || data.action_type === "remove_tag") && (
            <TagsForm data={data} cfg={cfg} />
          )}
          {data.kind === "action" && data.action_type === "set_custom_field" && <SetFieldForm data={data} cfg={cfg} />}
          {data.kind === "action" && data.action_type === "move_to_pipeline_stage" && <MoveStageForm data={data} cfg={cfg} />}
          {data.kind === "action" && data.action_type === "fire_webhook" && <WebhookForm data={data} cfg={cfg} />}
          {data.kind === "action" && data.action_type === "ai_classify_reply" && <AiClassifyForm data={data} cfg={cfg} />}
          {data.kind === "action" && data.action_type === "start_workflow" && <StartWorkflowForm data={data} cfg={cfg} />}
          {data.kind === "wait" && <WaitForm data={data} cfg={cfg} />}
          {data.kind === "condition" && <ConditionForm data={data} cfg={cfg} />}
          {data.kind === "split" && <SplitForm data={data} cfg={cfg} />}

          {data.kind !== "trigger" && (
            <Button variant="destructive" size="sm" className="w-full mt-6" onClick={() => onDelete(node.id)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete node
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Sub-forms ---------- */

function TriggerForm({ data, cfg }: any) {
  return (
    <>
      <div>
        <Label>Trigger type</Label>
        <Select value={data.config?.trigger_type ?? ""} onValueChange={(v) => cfg({ trigger_type: v })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {TRIGGER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Re-enrollment</Label>
        <RadioGroup
          className="mt-2 space-y-1"
          value={data.config?.re_enrollment ?? "never"}
          onValueChange={(v) => cfg({ re_enrollment: v })}
        >
          {["never", "after_completion", "always"].map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <RadioGroupItem value={opt} id={`re_${opt}`} />
              <Label htmlFor={`re_${opt}`} className="text-sm capitalize cursor-pointer">{opt.replace("_", " ")}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <p className="text-xs text-muted-foreground">
        Filters by tag/stage/custom field can be added later via the global filter editor.
      </p>
    </>
  );
}

function SendEmailForm({ data, cfg }: any) {
  const { data: accounts = [] } = useQuery({
    queryKey: ["email_accounts_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_accounts").select("id, email, name");
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <>
      <div>
        <Label>From account</Label>
        <Select value={data.config?.from_account_id ?? ""} onValueChange={(v) => cfg({ from_account_id: v })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select account…" /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label className="cursor-pointer" htmlFor="warmup_rotation">Use warmup rotation</Label>
        <Switch
          id="warmup_rotation"
          checked={!!data.config?.use_warmup_rotation}
          onCheckedChange={(v) => cfg({ use_warmup_rotation: v })}
        />
      </div>
      <div>
        <Label>Subject</Label>
        <Input
          className="h-9 mt-1"
          value={data.config?.subject ?? ""}
          onChange={(e) => cfg({ subject: e.target.value })}
          placeholder="Use {{first_name}} for merge tags"
        />
      </div>
      <div>
        <Label>Body</Label>
        <RichTextEditor
          value={data.config?.body ?? ""}
          onChange={(v) => cfg({ body: v })}
          placeholder="Type @ for variables"
        />
      </div>
    </>
  );
}

function TagsForm({ data, cfg }: any) {
  return (
    <div>
      <Label>Tags</Label>
      <div className="mt-1">
        <TagPicker value={data.config?.tag_ids ?? []} onChange={(ids) => cfg({ tag_ids: ids })} />
      </div>
    </div>
  );
}

function SetFieldForm({ data, cfg }: any) {
  const { data: fields = [] } = useQuery({
    queryKey: ["custom_fields_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_field_definitions").select("*");
      if (error) throw error;
      return data as any[];
    },
  });
  const selected = fields.find((f) => f.id === data.config?.field_id);
  return (
    <>
      <div>
        <Label>Field</Label>
        <Select value={data.config?.field_id ?? ""} onValueChange={(v) => cfg({ field_id: v, value: "" })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select field…" /></SelectTrigger>
          <SelectContent>
            {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {selected && (
        <div>
          <Label>Value</Label>
          {selected.field_type === "select" ? (
            <Select value={data.config?.value ?? ""} onValueChange={(v) => cfg({ value: v })}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(selected.options ?? []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-9 mt-1"
              type={selected.field_type === "number" ? "number" : selected.field_type === "date" ? "date" : "text"}
              value={data.config?.value ?? ""}
              onChange={(e) => cfg({ value: e.target.value })}
            />
          )}
        </div>
      )}
    </>
  );
}

function MoveStageForm({ data, cfg }: any) {
  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pipelines").select("id, name");
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: stages = [] } = useQuery({
    queryKey: ["stages_for_pipeline", data.config?.pipeline_id],
    enabled: !!data.config?.pipeline_id,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, position")
        .eq("pipeline_id", data.config.pipeline_id)
        .order("position");
      if (error) throw error;
      return rows as any[];
    },
  });
  return (
    <>
      <div>
        <Label>Pipeline</Label>
        <Select value={data.config?.pipeline_id ?? ""} onValueChange={(v) => cfg({ pipeline_id: v, stage_id: "" })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select pipeline…" /></SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Stage</Label>
        <Select value={data.config?.stage_id ?? ""} onValueChange={(v) => cfg({ stage_id: v })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select stage…" /></SelectTrigger>
          <SelectContent>
            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function WebhookForm({ data, cfg }: any) {
  const { data: endpoints = [] } = useQuery({
    queryKey: ["webhook_endpoints_outbound"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("id, name, url")
        .eq("direction", "outbound");
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <>
      <div>
        <Label>Endpoint</Label>
        <Select value={data.config?.endpoint_id ?? ""} onValueChange={(v) => cfg({ endpoint_id: v })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select endpoint…" /></SelectTrigger>
          <SelectContent>
            {endpoints.length === 0 && <SelectItem value="__none" disabled>No outbound endpoints</SelectItem>}
            {endpoints.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Payload template (JSON)</Label>
        <Textarea
          rows={6}
          className="mt-1 font-mono text-xs"
          value={data.config?.payload ?? '{\n  "email": "{{email}}"\n}'}
          onChange={(e) => cfg({ payload: e.target.value })}
        />
      </div>
    </>
  );
}

function AiClassifyForm({ data, cfg }: any) {
  const { data: fields = [] } = useQuery({
    queryKey: ["custom_fields_min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_field_definitions").select("id, label");
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <>
      <div>
        <Label>Classification prompt</Label>
        <Textarea
          rows={4}
          className="mt-1"
          value={data.config?.prompt ?? ""}
          onChange={(e) => cfg({ prompt: e.target.value })}
          placeholder="Classify the reply sentiment as positive / negative / neutral"
        />
      </div>
      <div>
        <Label>Write result to field</Label>
        <Select value={data.config?.output_field_id ?? ""} onValueChange={(v) => cfg({ output_field_id: v })}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select field…" /></SelectTrigger>
          <SelectContent>
            {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function StartWorkflowForm({ data, cfg }: any) {
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows_pickable"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflows").select("id, name");
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <div>
      <Label>Workflow to start</Label>
      <Select value={data.config?.workflow_id ?? ""} onValueChange={(v) => cfg({ workflow_id: v })}>
        <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {workflows.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function WaitForm({ data, cfg }: any) {
  const mode = data.config?.mode ?? "duration";
  return (
    <>
      <RadioGroup className="flex gap-4" value={mode} onValueChange={(v) => cfg({ mode: v })}>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="duration" id="m_d" />
          <Label htmlFor="m_d" className="cursor-pointer">Duration</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="event" id="m_e" />
          <Label htmlFor="m_e" className="cursor-pointer">Until event</Label>
        </div>
      </RadioGroup>
      {mode === "duration" ? (
        <div className="grid grid-cols-3 gap-2">
          <div><Label className="text-xs">Days</Label><Input type="number" min={0} className="h-9 mt-1" value={data.config?.days ?? 0} onChange={(e) => cfg({ days: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">Hours</Label><Input type="number" min={0} className="h-9 mt-1" value={data.config?.hours ?? 0} onChange={(e) => cfg({ hours: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">Minutes</Label><Input type="number" min={0} className="h-9 mt-1" value={data.config?.minutes ?? 0} onChange={(e) => cfg({ minutes: Number(e.target.value) })} /></div>
        </div>
      ) : (
        <>
          <div>
            <Label>Event type</Label>
            <Input className="h-9 mt-1" value={data.config?.event_type ?? ""} onChange={(e) => cfg({ event_type: e.target.value })} placeholder="e.g. email.replied" />
          </div>
          <div>
            <Label>Timeout (hours)</Label>
            <Input type="number" min={0} className="h-9 mt-1" value={data.config?.timeout_hours ?? 24} onChange={(e) => cfg({ timeout_hours: Number(e.target.value) })} />
          </div>
        </>
      )}
    </>
  );
}

function ConditionForm({ data, cfg }: any) {
  const rules: any[] = data.config?.rules ?? [{ field: "tag", operator: "has", value: "" }];
  const setRule = (i: number, patch: any) => {
    const next = rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    cfg({ rules: next });
  };
  return (
    <>
      <div>
        <Label>Match</Label>
        <RadioGroup className="flex gap-4 mt-1" value={data.config?.match ?? "all"} onValueChange={(v) => cfg({ match: v })}>
          <div className="flex items-center gap-2"><RadioGroupItem value="all" id="m_all" /><Label htmlFor="m_all" className="cursor-pointer">All of</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="any" id="m_any" /><Label htmlFor="m_any" className="cursor-pointer">Any of</Label></div>
        </RadioGroup>
      </div>
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-end">
            <div className="col-span-4">
              <Select value={r.field} onValueChange={(v) => setRule(i, { field: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag">Tag</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="pipeline_stage">Pipeline stage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-4">
              <Select value={r.operator} onValueChange={(v) => setRule(i, { operator: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">equals</SelectItem>
                  <SelectItem value="neq">not equals</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="has">has</SelectItem>
                  <SelectItem value="not_has">does not have</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <Input className="h-9" value={r.value} onChange={(e) => setRule(i, { value: e.target.value })} placeholder="Value" />
            </div>
            <Button variant="ghost" size="icon" className="col-span-1 h-9" onClick={() => cfg({ rules: rules.filter((_, x) => x !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => cfg({ rules: [...rules, { field: "tag", operator: "has", value: "" }] })}>
          <Plus className="h-4 w-4 mr-1" /> Add rule
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">True label</Label><Input className="h-9 mt-1" value={data.config?.true_label ?? "Yes"} onChange={(e) => cfg({ true_label: e.target.value })} /></div>
        <div><Label className="text-xs">False label</Label><Input className="h-9 mt-1" value={data.config?.false_label ?? "No"} onChange={(e) => cfg({ false_label: e.target.value })} /></div>
      </div>
    </>
  );
}

function SplitForm({ data, cfg }: any) {
  const variants: any[] = data.config?.variants ?? [
    { name: "A", weight: 50 },
    { name: "B", weight: 50 },
  ];
  const setV = (i: number, patch: any) => cfg({ variants: variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  return (
    <>
      <div className="space-y-2">
        {variants.map((v, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 items-end">
            <div className="col-span-7"><Label className="text-xs">Name</Label><Input className="h-9 mt-1" value={v.name} onChange={(e) => setV(i, { name: e.target.value })} /></div>
            <div className="col-span-4"><Label className="text-xs">Weight %</Label><Input type="number" min={0} max={100} className="h-9 mt-1" value={v.weight} onChange={(e) => setV(i, { weight: Number(e.target.value) })} /></div>
            <Button variant="ghost" size="icon" className="col-span-1 h-9" onClick={() => cfg({ variants: variants.filter((_, x) => x !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => cfg({ variants: [...variants, { name: `V${variants.length + 1}`, weight: 0 }] })}>
          <Plus className="h-4 w-4 mr-1" /> Add variant
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Weights should sum to 100. Each variant gets its own outgoing branch.</p>
    </>
  );
}

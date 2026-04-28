import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagPicker } from "@/components/shared/TagPicker";
import { colorClass } from "@/components/shared/ColorPicker";
import { Activity, Mail, MoveRight, Play, Tag as TagIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props {
  contactId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ContactDetailSheet({ contactId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false);

  const { data: contact } = useQuery({
    queryKey: ["contact", contactId],
    enabled: !!contactId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*, pipeline_stages(id, name, color, pipeline_id)")
        .eq("id", contactId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: tagLinks = [] } = useQuery({
    queryKey: ["contact_tags", contactId],
    enabled: !!contactId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_tags")
        .select("tag_id")
        .eq("contact_id", contactId!);
      if (error) throw error;
      return data.map((r) => r.tag_id);
    },
  });

  const { data: fields = [] } = useQuery({
    queryKey: ["custom_fields_all"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("custom_field_definitions").select("*").order("label");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: fieldValues = [] } = useQuery({
    queryKey: ["contact_custom_values", contactId],
    enabled: !!contactId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_custom_values")
        .select("*")
        .eq("contact_id", contactId!);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["all_stages"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id, name, color, pipeline_id, position")
        .order("position");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["contact_events", contactId],
    enabled: !!contactId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, event_type, occurred_at, payload")
        .eq("contact_id", contactId!)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows_manual"],
    enabled: workflowPickerOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("id, name, trigger_config, status")
        .eq("status", "active");
      if (error) throw error;
      return (data as any[]).filter((w) => w.trigger_config?.trigger_type === "manual_trigger");
    },
  });

  const updateTags = useMutation({
    mutationFn: async (newIds: string[]) => {
      const toAdd = newIds.filter((id) => !tagLinks.includes(id));
      const toRemove = tagLinks.filter((id) => !newIds.includes(id));
      if (toRemove.length > 0) {
        await supabase
          .from("contact_tags")
          .delete()
          .eq("contact_id", contactId!)
          .in("tag_id", toRemove);
      }
      if (toAdd.length > 0) {
        await supabase
          .from("contact_tags")
          .insert(toAdd.map((tag_id) => ({ contact_id: contactId!, tag_id })));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact_tags", contactId] });
      qc.invalidateQueries({ queryKey: ["pipeline_contacts"] });
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ field, value }: { field: any; value: any }) => {
      const payload: any = { contact_id: contactId, field_id: field.id, updated_at: new Date().toISOString() };
      if (field.field_type === "number") payload.value_number = value === "" ? null : Number(value);
      else if (field.field_type === "boolean") payload.value_boolean = !!value;
      else if (field.field_type === "date") payload.value_date = value || null;
      else payload.value_text = value;
      const { error } = await supabase.from("contact_custom_values").upsert(payload, {
        onConflict: "contact_id,field_id",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact_custom_values", contactId] }),
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const moveStage = useMutation({
    mutationFn: async (stageId: string) => {
      const stage = stages.find((s) => s.id === stageId);
      const { error } = await supabase
        .from("contacts")
        .update({ pipeline_stage_id: stageId, pipeline_id: stage?.pipeline_id })
        .eq("id", contactId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["pipeline_contacts"] });
    },
  });

  const startWorkflow = useMutation({
    mutationFn: async (workflowId: string) => {
      const { error } = await supabase.functions.invoke("event-emit", {
        body: {
          event_type: "manual.trigger",
          contact_id: contactId,
          source: { workflow_id: workflowId },
          payload: { workflow_id: workflowId },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Workflow triggered" });
      setWorkflowPickerOpen(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const getFieldValue = (fieldId: string) => {
    const v = fieldValues.find((f) => f.field_id === fieldId);
    if (!v) return "";
    return v.value_text ?? v.value_number ?? v.value_boolean ?? v.value_date ?? "";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{contact?.name || contact?.email || "Contact"}</SheetTitle>
          <p className="text-xs text-muted-foreground">{contact?.email}</p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Pipeline stage */}
          {stages.length > 0 && (
            <section>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
                Pipeline stage
              </Label>
              <Select
                value={contact?.pipeline_stage_id ?? ""}
                onValueChange={(v) => moveStage.mutate(v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="No stage" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", colorClass(s.color))} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}

          <Separator />

          {/* Tags */}
          <section>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              <TagIcon className="h-3 w-3 inline mr-1" /> Tags
            </Label>
            <TagPicker value={tagLinks} onChange={(next) => updateTags.mutate(next)} />
          </section>

          <Separator />

          {/* Custom fields */}
          {fields.length > 0 && (
            <section className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground block">
                Custom fields
              </Label>
              {fields.map((f) => (
                <CustomFieldInput
                  key={f.id}
                  field={f}
                  value={getFieldValue(f.id)}
                  onChange={(v) => updateField.mutate({ field: f, value: v })}
                />
              ))}
            </section>
          )}

          <Separator />

          {/* Start workflow */}
          <Button variant="outline" className="w-full" onClick={() => setWorkflowPickerOpen(true)}>
            <Play className="h-4 w-4 mr-2" /> Start workflow
          </Button>

          <Separator />

          {/* Activity timeline */}
          <section>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              <Activity className="h-3 w-3 inline mr-1" /> Recent activity
            </Label>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{humanizeEvent(e.event_type)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <Dialog open={workflowPickerOpen} onOpenChange={setWorkflowPickerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a workflow</DialogTitle>
            </DialogHeader>
            {workflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active workflows with manual trigger.</p>
            ) : (
              <ul className="space-y-1">
                {workflows.map((w: any) => (
                  <li key={w.id}>
                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                      onClick={() => startWorkflow.mutate(w.id)}
                    >
                      {w.name} <MoveRight className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function humanizeEvent(t: string) {
  return t.replace(/[._]/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
}

function CustomFieldInput({ field, value, onChange }: { field: any; value: any; onChange: (v: any) => void }) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => setLocal(value ?? ""), [value]);

  if (field.field_type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <Label>{field.label}</Label>
        <input
          type="checkbox"
          checked={!!local}
          onChange={(e) => {
            setLocal(e.target.checked);
            onChange(e.target.checked);
          }}
        />
      </div>
    );
  }
  if (field.field_type === "select") {
    const opts: string[] = Array.isArray(field.options) ? field.options : [];
    return (
      <div>
        <Label className="text-sm">{field.label}</Label>
        <Select value={String(local)} onValueChange={(v) => { setLocal(v); onChange(v); }}>
          <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div>
      <Label className="text-sm">{field.label}</Label>
      <Input
        className="h-9 mt-1"
        type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onChange(local)}
      />
    </div>
  );
}

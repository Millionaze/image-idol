import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LayoutList, Plus, Settings2, Trash2, GripVertical } from "lucide-react";
import { ColorPicker, colorClass } from "@/components/shared/ColorPicker";
import { TagPicker } from "@/components/shared/TagPicker";
import { ContactDetailSheet } from "@/components/contacts/ContactDetailSheet";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function Pipeline() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pipelineId, setPipelineId] = useState<string>("");
  const [view, setView] = useState<"board" | "table">("board");
  const [editorOpen, setEditorOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [activeContact, setActiveContact] = useState<any | null>(null);

  // Mobile force table
  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768 && view === "board") setView("table");
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [view]);

  const { data: pipelines = [], isLoading: pLoading } = useQuery({
    queryKey: ["pipelines_list"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("archived", false)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) {
      const def = pipelines.find((p) => p.is_default) ?? pipelines[0];
      setPipelineId(def.id);
    }
  }, [pipelines, pipelineId]);

  const { data: stages = [] } = useQuery({
    queryKey: ["pipeline_stages", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: contacts = [], isLoading: cLoading } = useQuery({
    queryKey: ["pipeline_contacts", pipelineId, tagFilter],
    enabled: !!pipelineId,
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("id, name, email, status, pipeline_stage_id, pipeline_entered_at, pipeline_stage_entered_at, opened_at, replied_at, sent_at")
        .eq("pipeline_id", pipelineId);
      const { data, error } = await query;
      if (error) throw error;
      let rows = data as any[];
      if (tagFilter.length > 0) {
        const { data: tagged } = await supabase
          .from("contact_tags")
          .select("contact_id")
          .in("tag_id", tagFilter);
        const ids = new Set((tagged ?? []).map((r: any) => r.contact_id));
        rows = rows.filter((r) => ids.has(r.id));
      }
      return rows;
    },
  });

  const { data: tagsByContact = {} } = useQuery({
    queryKey: ["pipeline_contact_tags", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_tags")
        .select("contact_id, tag_id, tags(id, name, color)")
        .limit(5000);
      if (error) throw error;
      const map: Record<string, any[]> = {};
      (data as any[]).forEach((r) => {
        if (!map[r.contact_id]) map[r.contact_id] = [];
        if (r.tags) map[r.contact_id].push(r.tags);
      });
      return map;
    },
  });

  const moveContact = useMutation({
    mutationFn: async ({ contactId, stageId }: { contactId: string; stageId: string }) => {
      const { error } = await supabase
        .from("contacts")
        .update({ pipeline_stage_id: stageId })
        .eq("id", contactId);
      if (error) throw error;
    },
    onMutate: async ({ contactId, stageId }) => {
      await qc.cancelQueries({ queryKey: ["pipeline_contacts", pipelineId, tagFilter] });
      const prev = qc.getQueryData<any[]>(["pipeline_contacts", pipelineId, tagFilter]);
      qc.setQueryData<any[]>(["pipeline_contacts", pipelineId, tagFilter], (old = []) =>
        old.map((c) => (c.id === contactId ? { ...c, pipeline_stage_id: stageId, pipeline_stage_entered_at: new Date().toISOString() } : c)),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pipeline_contacts", pipelineId, tagFilter], ctx.prev);
      toast({ title: "Move failed", description: e.message, variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["pipeline_contacts", pipelineId, tagFilter] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragStart = (e: DragStartEvent) => {
    const c = contacts.find((c) => c.id === e.active.id);
    setActiveContact(c ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveContact(null);
    const stageId = e.over?.id?.toString();
    const contactId = e.active.id.toString();
    if (!stageId || !contactId) return;
    const c = contacts.find((c) => c.id === contactId);
    if (!c || c.pipeline_stage_id === stageId) return;
    moveContact.mutate({ contactId, stageId });
  };

  if (pLoading) {
    return <div className="p-6"><Skeleton className="h-8 w-64 mb-4" /><div className="flex gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-72" />)}</div></div>;
  }

  if (pipelines.length === 0) {
    return (
      <div className="p-12 text-center">
        <LayoutList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold mb-1">No pipelines yet</h2>
        <p className="text-sm text-muted-foreground mb-4">Create a pipeline to start organizing contacts.</p>
        <Button onClick={() => setEditorOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New pipeline
        </Button>
        <PipelineEditorDialog open={editorOpen} onOpenChange={setEditorOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <header className="flex items-center gap-3 p-3 border-b border-border">
        <Select value={pipelineId} onValueChange={setPipelineId}>
          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
          <Settings2 className="h-3.5 w-3.5 mr-1" /> Manage
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block w-56"><TagPicker value={tagFilter} onChange={setTagFilter} placeholder="Filter by tag…" /></div>
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {view === "board" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto p-3">
            <div className="flex gap-3 min-w-max h-full">
              {stages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  contacts={contacts.filter((c) => c.pipeline_stage_id === stage.id)}
                  tagsByContact={tagsByContact}
                  loading={cLoading}
                  onCardClick={setOpenContactId}
                />
              ))}
            </div>
          </div>
          <DragOverlay>{activeContact && <ContactCard contact={activeContact} tags={tagsByContact[activeContact.id] ?? []} dragging />}</DragOverlay>
        </DndContext>
      ) : (
        <PipelineTableView
          contacts={contacts}
          stages={stages}
          tagsByContact={tagsByContact}
          loading={cLoading}
          onRowClick={setOpenContactId}
        />
      )}

      <PipelineEditorDialog open={editorOpen} onOpenChange={setEditorOpen} />
      <ContactDetailSheet contactId={openContactId} open={!!openContactId} onOpenChange={(v) => !v && setOpenContactId(null)} />
    </div>
  );
}

function StageColumn({ stage, contacts, tagsByContact, loading, onCardClick }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = contacts.slice(0, shown);
  return (
    <div
      ref={setNodeRef}
      className={cn("w-72 bg-card/30 rounded-md border border-border flex flex-col", isOver && "ring-2 ring-primary")}
    >
      <header className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", colorClass(stage.color))} />
          <h3 className="text-sm font-medium">{stage.name}</h3>
        </div>
        <Badge variant="outline" className="text-[10px]">{contacts.length}</Badge>
      </header>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No contacts</p>
        ) : (
          visible.map((c: any) => (
            <DraggableCard key={c.id} contact={c} tags={tagsByContact[c.id] ?? []} onClick={() => onCardClick(c.id)} />
          ))
        )}
        {contacts.length > shown && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShown((s) => s + PAGE_SIZE)}>
            Load more ({contacts.length - shown})
          </Button>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ contact, tags, onClick }: any) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: contact.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <ContactCard contact={contact} tags={tags} onClick={onClick} />
    </div>
  );
}

function ContactCard({ contact, tags, onClick, dragging }: any) {
  const enteredAt = contact.pipeline_stage_entered_at;
  const lastActivity = contact.replied_at || contact.opened_at || contact.sent_at;
  return (
    <Card
      onClick={onClick}
      className={cn("cursor-pointer hover:border-primary/50 transition-colors", dragging && "shadow-lg")}
    >
      <CardContent className="p-2.5">
        <div className="text-sm font-medium truncate">{contact.name || contact.email}</div>
        {contact.name && <div className="text-[11px] text-muted-foreground truncate">{contact.email}</div>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.slice(0, 3).map((t: any) => (
              <Badge key={t.id} variant="outline" className="text-[10px] h-4 px-1.5 gap-1">
                <span className={cn("h-1 w-1 rounded-full", colorClass(t.color))} />
                {t.name}
              </Badge>
            ))}
            {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
          </div>
        )}
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
          {enteredAt && <span>{formatDistanceToNow(new Date(enteredAt), { addSuffix: false })} in stage</span>}
          {lastActivity && <span>· last {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineTableView({ contacts, stages, tagsByContact, loading, onRowClick }: any) {
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s: any) => [s.id, s])), [stages]);
  return (
    <div className="flex-1 overflow-auto p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead>In stage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6}><Skeleton className="h-8" /></TableCell></TableRow>
          ) : contacts.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No contacts</TableCell></TableRow>
          ) : contacts.map((c: any) => {
            const stage = stageMap[c.pipeline_stage_id];
            const lastActivity = c.replied_at || c.opened_at || c.sent_at;
            const tags = tagsByContact[c.id] ?? [];
            return (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => onRowClick(c.id)}>
                <TableCell className="font-medium">{c.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.email}</TableCell>
                <TableCell>
                  {stage && <Badge variant="outline" className="gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", colorClass(stage.color))} />{stage.name}</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 3).map((t: any) => (
                      <Badge key={t.id} variant="outline" className="text-[10px] gap-1"><span className={cn("h-1 w-1 rounded-full", colorClass(t.color))} />{t.name}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{lastActivity ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true }) : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.pipeline_stage_entered_at ? formatDistanceToNow(new Date(c.pipeline_stage_entered_at)) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------- Pipeline editor dialog -------------------- */

function PipelineEditorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines_editor"],
    enabled: open && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*, pipeline_stages(id, name, color, position, is_won, is_lost)")
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
  });

  const createPipeline = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("pipelines")
        .insert({ user_id: user!.id, name: "New pipeline" })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["pipelines_editor"] });
      qc.invalidateQueries({ queryKey: ["pipelines_list"] });
      setEditingId(row.id);
    },
  });

  const editing = pipelines.find((p) => p.id === editingId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage pipelines</DialogTitle>
        </DialogHeader>
        {!editing ? (
          <>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {pipelines.map((p) => (
                <div key={p.id} className="flex items-center justify-between border border-border rounded-md p-3">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.pipeline_stages?.length ?? 0} stages</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(p.id)}>Edit</Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => createPipeline.mutate()}><Plus className="h-4 w-4 mr-1" /> New pipeline</Button>
            </DialogFooter>
          </>
        ) : (
          <PipelineEditor pipeline={editing} onBack={() => setEditingId(null)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PipelineEditor({ pipeline, onBack }: { pipeline: any; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(pipeline.name);
  const [stages, setStages] = useState<any[]>([...(pipeline.pipeline_stages ?? [])].sort((a, b) => a.position - b.position));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = stages.findIndex((s) => s.id === e.active.id);
    const newIdx = stages.findIndex((s) => s.id === e.over!.id);
    setStages((s) => arrayMove(s, oldIdx, newIdx));
  };

  const save = useMutation({
    mutationFn: async () => {
      await supabase.from("pipelines").update({ name }).eq("id", pipeline.id);
      // Reorder + update each stage
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        if (!s.id.startsWith("new_")) {
          await supabase
            .from("pipeline_stages")
            .update({ name: s.name, color: s.color, is_won: !!s.is_won, is_lost: !!s.is_lost, position: i })
            .eq("id", s.id);
        } else {
          await supabase.from("pipeline_stages").insert({
            pipeline_id: pipeline.id,
            name: s.name,
            color: s.color,
            is_won: !!s.is_won,
            is_lost: !!s.is_lost,
            position: i,
          });
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["pipelines_editor"] });
      qc.invalidateQueries({ queryKey: ["pipeline_stages"] });
      qc.invalidateQueries({ queryKey: ["pipelines_list"] });
      onBack();
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const deleteStage = async (stageId: string) => {
    if (stageId.startsWith("new_")) {
      setStages((s) => s.filter((x) => x.id !== stageId));
      return;
    }
    const { error } = await supabase.from("pipeline_stages").delete().eq("id", stageId);
    if (error) {
      toast({ title: "Delete failed", description: "Stage may have contacts.", variant: "destructive" });
      return;
    }
    setStages((s) => s.filter((x) => x.id !== stageId));
  };

  return (
    <div className="space-y-3">
      <Button variant="link" size="sm" className="px-0" onClick={onBack}>← All pipelines</Button>
      <div>
        <Label>Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 mt-1" />
      </div>
      <div>
        <Label>Stages</Label>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 mt-1">
              {stages.map((s, idx) => (
                <SortableStageRow
                  key={s.id}
                  stage={s}
                  onChange={(patch) => setStages((arr) => arr.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
                  onDelete={() => deleteStage(s.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setStages((s) => [...s, { id: `new_${Date.now()}`, name: "New stage", color: "gray", position: s.length, is_won: false, is_lost: false }])}
        >
          <Plus className="h-4 w-4 mr-1" /> Add stage
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()}>Save</Button>
      </DialogFooter>
    </div>
  );
}

function SortableStageRow({ stage, onChange, onDelete }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border border-border rounded-md p-2 bg-card"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorPicker value={stage.color} onChange={(c) => onChange({ color: c })} />
      <Input className="h-8 flex-1" value={stage.name} onChange={(e) => onChange({ name: e.target.value })} />
      <label className="flex items-center gap-1 text-xs">
        <Checkbox checked={!!stage.is_won} onCheckedChange={(v) => onChange({ is_won: !!v, is_lost: false })} /> Won
      </label>
      <label className="flex items-center gap-1 text-xs">
        <Checkbox checked={!!stage.is_lost} onCheckedChange={(v) => onChange({ is_lost: !!v, is_won: false })} /> Lost
      </label>
      <Button variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

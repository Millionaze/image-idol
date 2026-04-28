import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Save, Trash2, Workflow as WorkflowIcon, Search, Zap } from "lucide-react";
import { WorkflowNode } from "@/components/workflows/WorkflowNode";
import { ActionPickerDialog } from "@/components/workflows/ActionPickerDialog";
import { NodeConfigSheet } from "@/components/workflows/NodeConfigSheet";
import { autoLayout, validateGraph, newId } from "@/components/workflows/lib/graph";
import type { NodeData } from "@/components/workflows/lib/catalog";

const NODE_TYPES = { wf: WorkflowNode };

export default function Workflows() {
  return (
    <ReactFlowProvider>
      <WorkflowsInner />
    </ReactFlowProvider>
  );
}

function WorkflowsInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: workflows = [], isLoading: listLoading } = useQuery({
    queryKey: ["workflows_list"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("id, name, status, trigger_config, stats, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = workflows.filter(
    (w) =>
      (statusFilter === "all" || w.status === statusFilter) &&
      (!search || w.name.toLowerCase().includes(search.toLowerCase())),
  );

  const createWorkflow = useMutation({
    mutationFn: async () => {
      const initialNodes: Node[] = [
        {
          id: newId("trig"),
          type: "wf",
          position: { x: 250, y: 40 },
          data: { kind: "trigger", label: "When …", config: { trigger_type: "manual_trigger", re_enrollment: "never" } } as any,
        },
      ];
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          user_id: user!.id,
          name: "Untitled workflow",
          status: "draft",
          graph: { nodes: initialNodes, edges: [] },
          trigger_config: { trigger_type: "manual_trigger" },
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["workflows_list"] });
      navigate(`/workflows/${row.id}`);
    },
    onError: (e: any) => toast({ title: "Could not create workflow", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="w-[300px] border-r border-border bg-card/50 flex flex-col">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <WorkflowIcon className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Workflows</h2>
            <Button size="sm" className="ml-auto" onClick={() => createWorkflow.mutate()}>
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="h-8 pl-7" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No workflows yet.</p>
          ) : (
            <ul>
              {filtered.map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => navigate(`/workflows/${w.id}`)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-accent transition-colors ${id === w.id ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{w.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {w.trigger_config?.trigger_type ?? "no trigger"} · {w.stats?.enrolled ?? 0} enrolled
                        </div>
                      </div>
                      <StatusBadge status={w.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Canvas area */}
      <main className="flex-1 flex flex-col">
        {!id ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <WorkflowIcon className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-1">Create your first workflow</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Workflows react to events (opens, replies, tags, stage changes) and run automated sequences.
            </p>
            <Button onClick={() => createWorkflow.mutate()}>
              <Plus className="h-4 w-4 mr-2" /> New workflow
            </Button>
          </div>
        ) : (
          <WorkflowEditor key={id} workflowId={id} />
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: any = status === "active" ? "default" : status === "paused" ? "secondary" : "outline";
  return <Badge variant={variant} className="text-[10px] capitalize">{status}</Badge>;
}

function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: workflow, isLoading } = useQuery({
    queryKey: ["workflow", workflowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("id", workflowId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [dirty, setDirty] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (!workflow || initialised.current) return;
    setName(workflow.name);
    setStatus(workflow.status);
    const g = workflow.graph || { nodes: [], edges: [] };
    let n: Node[] = (g.nodes || []).map((nd: any) => ({ ...nd, type: "wf" }));
    const e: Edge[] = g.edges || [];
    if (n.length > 0 && n.every((nd) => !nd.position?.x && !nd.position?.y)) {
      n = autoLayout(n, e);
    }
    setNodes(n);
    setEdges(e);
    initialised.current = true;
  }, [workflow, setNodes, setEdges]);

  const markDirty = useCallback(() => setDirty(true), []);

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => addEdge({ ...conn, type: "default" }, eds));
      markDirty();
    },
    [setEdges, markDirty],
  );

  const handlePick = (item: { type: string; label: string; kind: string }) => {
    const id = newId(item.kind === "trigger" ? "trig" : item.kind);
    const baseY = pendingConnection ? 0 : 200;
    const sourceNode = nodes.find((n) => n.id === pendingConnection?.source);
    const newNode: Node = {
      id,
      type: "wf",
      position: sourceNode
        ? { x: sourceNode.position.x, y: sourceNode.position.y + 140 }
        : { x: 250, y: baseY },
      data: {
        kind: item.kind as any,
        action_type: item.kind === "action" ? item.type : undefined,
        label: item.label,
        config: item.kind === "split" ? { variants: [{ name: "A", weight: 50 }, { name: "B", weight: 50 }] } : {},
      } as any,
    };
    setNodes((nds) => [...nds, newNode]);
    if (pendingConnection?.source) {
      setEdges((eds) =>
        addEdge(
          { source: pendingConnection.source!, sourceHandle: pendingConnection.sourceHandle, target: id, type: "default" },
          eds,
        ),
      );
    }
    setPendingConnection(null);
    markDirty();
  };

  const updateNodeData = (nodeId: string, next: NodeData) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: next as any } : n)));
    markDirty();
  };

  const deleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    markDirty();
  };

  const persist = useMutation({
    mutationFn: async (opts?: { silent?: boolean }) => {
      const validation = validateGraph(nodes, edges);
      if (!validation.ok) throw new Error(validation.error);
      const trigger_node = nodes.find((n) => (n.data as any)?.kind === "trigger");
      const trigger_config = (trigger_node?.data as any)?.config ?? {};
      const { error } = await supabase
        .from("workflows")
        .update({
          name,
          status,
          graph: { nodes, edges },
          trigger_config,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId);
      if (error) throw error;
      return opts;
    },
    onSuccess: (opts) => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["workflows_list"] });
      qc.invalidateQueries({ queryKey: ["workflow", workflowId] });
      if (!opts?.silent) toast({ title: "Saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  // Auto-save every 10s when dirty
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => persist.mutate({ silent: true }), 10000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, nodes, edges, name, status]);

  const deleteWorkflow = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("workflows").delete().eq("id", workflowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows_list"] });
      navigate("/workflows");
    },
  });

  const stats = workflow?.stats ?? {};

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="flex-1 h-[calc(100vh-12rem)]" />
      </div>
    );
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5 bg-card/30">
        <Input
          className="h-8 max-w-md font-medium"
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
        />
        <Select value={status} onValueChange={(v) => { setStatus(v); markDirty(); }}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1 text-[11px] text-muted-foreground ml-3">
          <Badge variant="outline">{stats.enrolled ?? 0} enrolled</Badge>
          <Badge variant="outline">{stats.completed ?? 0} completed</Badge>
          <Badge variant="outline">{stats.exited ?? 0} exited</Badge>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">unsaved…</span>}
          <Button size="sm" onClick={() => persist.mutate(undefined)} disabled={persist.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost"><Trash2 className="h-4 w-4" /></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteWorkflow.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(c) => { onNodesChange(c); markDirty(); }}
          onEdgesChange={(c) => { onEdgesChange(c); markDirty(); }}
          onConnect={onConnect}
          onConnectEnd={(_, params) => {
            // If connection didn't land on a node, open picker
            if (!(params as any).toNode && (params as any).fromNode) {
              setPendingConnection({
                source: (params as any).fromNode.id,
                sourceHandle: (params as any).fromHandle?.id ?? null,
                target: null,
                targetHandle: null,
              } as any);
              setPickerOpen(true);
            }
          }}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_, n) => setSelectedNode(n)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>

        <Button
          size="sm"
          variant="secondary"
          className="absolute top-3 left-3 z-10"
          onClick={() => { setPendingConnection(null); setPickerOpen(true); }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add node
        </Button>
      </div>

      <ActionPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onPick={handlePick} />
      <NodeConfigSheet
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        onChange={updateNodeData}
        onDelete={deleteNode}
      />
    </>
  );
}

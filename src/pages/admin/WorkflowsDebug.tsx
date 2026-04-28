import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface EventRow {
  id: string;
  contact_id: string | null;
  event_type: string;
  source: any;
  payload: any;
  occurred_at: string;
  processing_status: string;
  error: string | null;
}

interface RunRow {
  id: string;
  workflow_id: string;
  contact_id: string;
  status: string;
  current_node_id: string | null;
  next_action_at: string | null;
  started_at: string;
  error: string | null;
}

interface LogRow {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  status: string;
  result: any;
  executed_at: string;
}

export default function WorkflowsDebug() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [filter, setFilter] = useState("");

  // Test event form
  const [contactId, setContactId] = useState("");
  const [eventType, setEventType] = useState("email.clicked");
  const [payloadJson, setPayloadJson] = useState('{"url":"https://example.com/pricing"}');
  const [sourceJson, setSourceJson] = useState('{"link_url":"https://example.com/pricing"}');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    let q = supabase.from("events").select("*").order("occurred_at", { ascending: false }).limit(100);
    if (filter) q = q.ilike("event_type", `%${filter}%`);
    const { data: ev } = await q;
    setEvents((ev as EventRow[]) ?? []);

    const { data: rn } = await supabase
      .from("workflow_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    setRuns((rn as RunRow[]) ?? []);

    const { data: lg } = await supabase
      .from("workflow_run_log")
      .select("*")
      .order("executed_at", { ascending: false })
      .limit(50);
    setLogs((lg as LogRow[]) ?? []);
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 3000);
    return () => clearInterval(i);
  }, [filter]);

  const fireEvent = async () => {
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      let payload: any = {};
      let source: any = {};
      try { payload = JSON.parse(payloadJson || "{}"); } catch { throw new Error("Invalid payload JSON"); }
      try { source = JSON.parse(sourceJson || "{}"); } catch { throw new Error("Invalid source JSON"); }

      const { error } = await supabase.from("events").insert({
        user_id: u.user.id,
        contact_id: contactId || null,
        event_type: eventType,
        source,
        payload,
      });
      if (error) throw error;
      toast({ title: "Event fired", description: `${eventType} queued` });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const runProcessorNow = async () => {
    await supabase.functions.invoke("workflow-event-processor", { body: {} });
    await supabase.functions.invoke("workflow-runner", { body: {} });
    toast({ title: "Triggered", description: "Processor + runner invoked" });
    setTimeout(load, 800);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflows Debug</h1>
          <p className="text-muted-foreground text-sm">Inspect events, runs, and logs in real time.</p>
        </div>
        <Button onClick={runProcessorNow} variant="outline">Run engine now</Button>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-lg">Fire test event</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Contact ID</Label>
            <Input value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <Label>Event type</Label>
            <Input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="email.clicked" />
          </div>
          <div>
            <Label>Source (JSON)</Label>
            <Textarea value={sourceJson} onChange={(e) => setSourceJson(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Payload (JSON)</Label>
            <Textarea value={payloadJson} onChange={(e) => setPayloadJson(e.target.value)} rows={3} />
          </div>
        </div>
        <Button onClick={fireEvent} disabled={submitting} className="bg-primary">
          {submitting ? "Firing…" : "Fire event"}
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Recent events</h2>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter type…" className="max-w-xs" />
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b">
              <tr><th className="text-left p-1">When</th><th className="text-left p-1">Type</th><th className="text-left p-1">Status</th><th className="text-left p-1">Contact</th><th className="text-left p-1">Source</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border/40">
                  <td className="p-1">{new Date(e.occurred_at).toLocaleTimeString()}</td>
                  <td className="p-1 font-mono">{e.event_type}</td>
                  <td className="p-1"><Badge variant={e.processing_status === "processed" ? "default" : e.processing_status === "failed" ? "destructive" : "secondary"}>{e.processing_status}</Badge></td>
                  <td className="p-1 font-mono opacity-70">{e.contact_id?.slice(0, 8)}</td>
                  <td className="p-1 font-mono opacity-70 truncate max-w-xs">{JSON.stringify(e.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-lg">Active runs</h2>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b">
              <tr><th className="text-left p-1">Started</th><th className="text-left p-1">Workflow</th><th className="text-left p-1">Contact</th><th className="text-left p-1">Status</th><th className="text-left p-1">Node</th><th className="text-left p-1">Next</th><th className="text-left p-1">Error</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="p-1">{new Date(r.started_at).toLocaleTimeString()}</td>
                  <td className="p-1 font-mono opacity-70">{r.workflow_id.slice(0, 8)}</td>
                  <td className="p-1 font-mono opacity-70">{r.contact_id.slice(0, 8)}</td>
                  <td className="p-1"><Badge variant={r.status === "running" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></td>
                  <td className="p-1 font-mono">{r.current_node_id}</td>
                  <td className="p-1">{r.next_action_at ? new Date(r.next_action_at).toLocaleTimeString() : "—"}</td>
                  <td className="p-1 text-destructive truncate max-w-xs">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-lg">Recent run logs</h2>
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b">
              <tr><th className="text-left p-1">When</th><th className="text-left p-1">Run</th><th className="text-left p-1">Node</th><th className="text-left p-1">Type</th><th className="text-left p-1">Status</th><th className="text-left p-1">Result</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/40">
                  <td className="p-1">{new Date(l.executed_at).toLocaleTimeString()}</td>
                  <td className="p-1 font-mono opacity-70">{l.run_id.slice(0, 8)}</td>
                  <td className="p-1 font-mono">{l.node_id}</td>
                  <td className="p-1">{l.node_type}</td>
                  <td className="p-1"><Badge variant={l.status === "completed" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>{l.status}</Badge></td>
                  <td className="p-1 font-mono opacity-70 truncate max-w-md">{l.result ? JSON.stringify(l.result) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

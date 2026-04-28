// workflow-event-processor: cron'd every 30s.
// 1) Drains pending events
// 2) Enrolls new workflow runs for matched workflows
// 3) Wakes paused runs whose current node is a wait_until_event matching the event
// 4) Marks events processed (or moves to DLQ on failure)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findMatchingWorkflows, EventRow } from "../_shared/event-matcher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 200;

async function findEntryNodeId(graph: any): Promise<string | null> {
  const entry = (graph?.nodes ?? []).find((n: any) => n.type === "entry");
  if (!entry) return null;
  const edge = (graph?.edges ?? []).find((e: any) => e.from === entry.id);
  return edge?.to ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: events } = await supabase
      .from("events")
      .select("*")
      .eq("processing_status", "pending")
      .order("occurred_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processedCount = 0;
    let enrolledCount = 0;
    let wokeCount = 0;
    let failedCount = 0;

    for (const event of events as EventRow[]) {
      try {
        // 1) Wake paused runs waiting on this event
        if (event.contact_id) {
          const { data: pausedRuns } = await supabase
            .from("workflow_runs")
            .select("id, current_node_id, workflows!inner(graph)")
            .eq("status", "paused")
            .eq("contact_id", event.contact_id);

          for (const run of (pausedRuns ?? []) as any[]) {
            const node = (run.workflows.graph?.nodes ?? []).find((n: any) => n.id === run.current_node_id);
            if (node?.type === "action" && node.action_type === "wait_until_event") {
              const cfg = node.config ?? {};
              if (cfg.event_type === event.event_type) {
                await supabase
                  .from("workflow_runs")
                  .update({ status: "running", next_action_at: new Date().toISOString() })
                  .eq("id", run.id);
                wokeCount++;
              }
            }
          }
        }

        // 2) Enroll matched workflows
        const matched = await findMatchingWorkflows(supabase, event);
        for (const wf of matched) {
          if (!event.contact_id) continue;

          const { data: existing } = await supabase
            .from("workflow_runs")
            .select("id, status")
            .eq("workflow_id", wf.id)
            .eq("contact_id", event.contact_id)
            .maybeSingle();

          const policy = wf.trigger_config.re_enrollment ?? "after_completion";
          if (existing) {
            if (policy === "never") continue;
            if (policy === "after_completion" && existing.status === "running") continue;
            if (policy === "after_completion" && existing.status === "paused") continue;
            // Delete previous to re-enroll (simple, predictable)
            await supabase.from("workflow_runs").delete().eq("id", existing.id);
          }

          const { data: wfFull } = await supabase
            .from("workflows")
            .select("graph")
            .eq("id", wf.id)
            .single();
          const firstNodeId = await findEntryNodeId(wfFull?.graph);
          if (!firstNodeId) continue;

          await supabase.from("workflow_runs").insert({
            workflow_id: wf.id,
            contact_id: event.contact_id,
            status: "running",
            current_node_id: firstNodeId,
            triggered_by: { event_id: event.id, event_type: event.event_type },
            next_action_at: new Date().toISOString(),
          });
          enrolledCount++;
        }

        await supabase
          .from("events")
          .update({ processing_status: "processed", processed_at: new Date().toISOString() })
          .eq("id", event.id);
        processedCount++;
      } catch (e: any) {
        console.error("event processing failed:", event.id, e);
        await supabase
          .from("events")
          .update({ processing_status: "failed", error: String(e?.message ?? e) })
          .eq("id", event.id);
        await supabase.from("event_dlq").insert({
          original_event_id: event.id,
          event_type: event.event_type,
          payload: event.payload,
          error: String(e?.message ?? e),
        });
        failedCount++;
      }
    }

    return new Response(
      JSON.stringify({ processed: processedCount, enrolled: enrolledCount, woke: wokeCount, failed: failedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("processor fatal:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

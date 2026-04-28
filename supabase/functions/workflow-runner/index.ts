// workflow-runner: cron'd every 30s.
// Walks runs that are due, dispatches actions, advances current_node_id.
// Cooperative budget: 5 nodes per run per tick to avoid edge-fn timeouts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { evaluateCondition } from "../_shared/condition-evaluator.ts";
import { renderTemplate, buildMergeContext } from "../_shared/merge-tags.ts";
import { sendEmailViaAccount, emitEvent } from "../_shared/send-email-internal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH = 100;
const NODE_BUDGET = 5;

function nextNodeId(graph: any, fromId: string, branch?: string): string | null {
  const edges = (graph?.edges ?? []).filter((e: any) => e.from === fromId);
  if (branch) {
    const found = edges.find((e: any) => e.branch === branch);
    if (found) return found.to;
  }
  return edges[0]?.to ?? null;
}

async function logNode(supabase: any, runId: string, nodeId: string, nodeType: string, status: string, result?: any, durationMs?: number) {
  await supabase.from("workflow_run_log").insert({
    run_id: runId,
    node_id: nodeId,
    node_type: nodeType,
    status,
    result: result ?? null,
    duration_ms: durationMs ?? null,
  });
}

async function executeAction(supabase: any, run: any, node: any): Promise<{ next?: string | null; pause?: boolean; end?: "completed" | "exited" | "failed"; result?: any; error?: string }> {
  const cfg = node.config ?? {};
  const userId = run.workflows.user_id as string;
  const contactId = run.contact_id as string;

  switch (node.action_type) {
    case "add_tag": {
      if (!cfg.tag_id) return { error: "tag_id required" };
      await supabase.from("contact_tags").upsert({
        contact_id: contactId, tag_id: cfg.tag_id, added_by_workflow_id: run.workflow_id,
      }, { onConflict: "contact_id,tag_id" });
      await emitEvent(supabase, { user_id: userId, contact_id: contactId, event_type: "tag.added", source: { workflow_run_id: run.id }, payload: { tag_id: cfg.tag_id } });
      return { result: { tag_id: cfg.tag_id } };
    }
    case "remove_tag": {
      if (!cfg.tag_id) return { error: "tag_id required" };
      await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", cfg.tag_id);
      await emitEvent(supabase, { user_id: userId, contact_id: contactId, event_type: "tag.removed", source: { workflow_run_id: run.id }, payload: { tag_id: cfg.tag_id } });
      return { result: { tag_id: cfg.tag_id } };
    }
    case "set_custom_field": {
      if (!cfg.field_id) return { error: "field_id required" };
      const { data: def } = await supabase.from("custom_field_definitions").select("field_type").eq("id", cfg.field_id).single();
      const upd: any = { contact_id: contactId, field_id: cfg.field_id, updated_at: new Date().toISOString() };
      const v = cfg.value;
      switch (def?.field_type) {
        case "number": upd.value_number = Number(v); break;
        case "boolean": upd.value_boolean = Boolean(v); break;
        case "date": upd.value_date = new Date(v).toISOString(); break;
        default: upd.value_text = String(v);
      }
      await supabase.from("contact_custom_values").upsert(upd, { onConflict: "contact_id,field_id" });
      await emitEvent(supabase, { user_id: userId, contact_id: contactId, event_type: "field.updated", source: { workflow_run_id: run.id }, payload: { field_id: cfg.field_id, value: v } });
      return { result: { field_id: cfg.field_id } };
    }
    case "move_to_pipeline_stage": {
      if (!cfg.stage_id) return { error: "stage_id required" };
      // Trigger emits stage.changed event automatically
      await supabase.from("contacts").update({
        pipeline_id: cfg.pipeline_id ?? null,
        pipeline_stage_id: cfg.stage_id,
      }).eq("id", contactId);
      return { result: { stage_id: cfg.stage_id } };
    }
    case "send_email": {
      const { data: account } = await supabase.from("email_accounts").select("*").eq("id", cfg.from_account_id).maybeSingle();
      if (!account) return { error: "from_account_id missing or not found" };
      const mc = await buildMergeContext(supabase, contactId, run.context ?? {});
      const subject = renderTemplate(cfg.subject ?? "", mc);
      const body = renderTemplate(cfg.body_template ?? cfg.body ?? "", mc);
      const to = mc.contact.email;
      if (!to) return { error: "contact has no email" };
      const res = await sendEmailViaAccount({ account, to, subject, htmlBody: body, contactId, trackOpens: true });
      if (!res.success) {
        await emitEvent(supabase, { user_id: userId, contact_id: contactId, event_type: "email.bounced", source: { workflow_run_id: run.id }, payload: { error: res.error } });
        return { error: res.error };
      }
      await emitEvent(supabase, { user_id: userId, contact_id: contactId, event_type: "email.sent", source: { workflow_run_id: run.id, account_id: account.id }, payload: { subject } });
      return { result: { sent_to: to } };
    }
    case "send_sms":
    case "assign_to_user": {
      // Stubbed: log only.
      return { result: { stub: node.action_type, config: cfg } };
    }
    case "start_workflow": {
      if (!cfg.workflow_id) return { error: "workflow_id required" };
      const { data: wf } = await supabase.from("workflows").select("graph").eq("id", cfg.workflow_id).single();
      const entry = (wf?.graph?.nodes ?? []).find((n: any) => n.type === "entry");
      const firstId = (wf?.graph?.edges ?? []).find((e: any) => e.from === entry?.id)?.to ?? null;
      await supabase.from("workflow_runs").upsert({
        workflow_id: cfg.workflow_id,
        contact_id: contactId,
        status: "running",
        current_node_id: firstId,
        next_action_at: new Date().toISOString(),
        triggered_by: { from_workflow_run_id: run.id },
      }, { onConflict: "workflow_id,contact_id" });
      return { result: { started: cfg.workflow_id } };
    }
    case "fire_webhook": {
      if (!cfg.endpoint_id) return { error: "endpoint_id required" };
      const { data: ep } = await supabase.from("webhook_endpoints").select("*").eq("id", cfg.endpoint_id).maybeSingle();
      if (!ep || ep.direction !== "outbound" || ep.status !== "active") return { error: "endpoint missing/disabled" };
      const mc = await buildMergeContext(supabase, contactId, run.context ?? {});
      const payloadStr = renderTemplate(JSON.stringify(cfg.payload_template ?? { contact_id: contactId }), mc);
      let payload: any;
      try { payload = JSON.parse(payloadStr); } catch { payload = { raw: payloadStr }; }
      // Async fire + log
      const sig = await hmacSign(ep.secret, JSON.stringify(payload));
      const { data: delivery } = await supabase.from("webhook_deliveries").insert({
        endpoint_id: ep.id, direction: "outbound", payload, status: "pending",
      }).select("id").single();
      try {
        const r = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Signature": sig },
          body: JSON.stringify(payload),
        });
        const respText = await r.text().catch(() => "");
        await supabase.from("webhook_deliveries").update({
          response_status: r.status, response_body: respText.slice(0, 4000),
          status: r.ok ? "success" : "failed", delivered_at: new Date().toISOString(),
        }).eq("id", delivery.id);
        return { result: { delivery_id: delivery.id, status: r.status } };
      } catch (e: any) {
        await supabase.from("webhook_deliveries").update({
          status: "failed", response_body: String(e?.message ?? e), delivered_at: new Date().toISOString(),
        }).eq("id", delivery.id);
        return { error: e?.message ?? "webhook failed" };
      }
    }
    case "wait_until_event": {
      // Pause; event-processor will wake us
      return { pause: true, result: { waiting_for: cfg.event_type } };
    }
    case "ai_classify_reply": {
      const { data: msg } = await supabase
        .from("inbox_messages")
        .select("subject, body, from_email, account_id")
        .eq("from_email", (await supabase.from("contacts").select("email").eq("id", contactId).single()).data?.email ?? "")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!msg) return { error: "no inbound message found for contact" };
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) return { error: "ANTHROPIC_API_KEY missing" };
      const prompt = cfg.classification_prompt ?? "Classify the reply sentiment as one of: positive, neutral, negative. Respond with JSON {\"sentiment\":\"...\",\"summary\":\"...\"}";
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          messages: [{ role: "user", content: `${prompt}\n\nSubject: ${msg.subject}\n\nBody:\n${msg.body}` }],
        }),
      });
      if (!aiRes.ok) return { error: `AI ${aiRes.status}` };
      const aiJson = await aiRes.json();
      const text = aiJson?.content?.[0]?.text ?? "{}";
      let parsed: any = {};
      try { parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}"); } catch { /* */ }
      if (cfg.output_field && parsed.sentiment) {
        const { data: def } = await supabase.from("custom_field_definitions").select("id").eq("user_id", userId).eq("key", cfg.output_field).maybeSingle();
        if (def) {
          await supabase.from("contact_custom_values").upsert({
            contact_id: contactId, field_id: def.id, value_text: parsed.sentiment, updated_at: new Date().toISOString(),
          }, { onConflict: "contact_id,field_id" });
        }
      }
      return { result: parsed };
    }
    case "end_workflow": return { end: "completed" };
    case "exit_workflow": return { end: "exited" };
    default:
      return { error: `unknown action_type: ${node.action_type}` };
  }
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: runs } = await supabase
      .from("workflow_runs")
      .select("*, workflows!inner(id,user_id,graph,exit_conditions,status)")
      .eq("status", "running")
      .lte("next_action_at", new Date().toISOString())
      .limit(BATCH);

    if (!runs || runs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalNodes = 0;
    let completedRuns = 0;
    let failedRuns = 0;

    for (const run of runs as any[]) {
      const graph = run.workflows.graph;
      let currentId = run.current_node_id;
      let nodesThisTick = 0;
      let runEnded = false;

      while (currentId && nodesThisTick < NODE_BUDGET) {
        const node = (graph?.nodes ?? []).find((n: any) => n.id === currentId);
        if (!node) {
          await supabase.from("workflow_runs").update({ status: "failed", error: `node ${currentId} not found`, completed_at: new Date().toISOString() }).eq("id", run.id);
          failedRuns++;
          runEnded = true;
          break;
        }

        const t0 = Date.now();
        await logNode(supabase, run.id, node.id, node.type, "started");
        nodesThisTick++;
        totalNodes++;

        if (node.type === "exit") {
          await supabase.from("workflow_runs").update({ status: "completed", current_node_id: node.id, completed_at: new Date().toISOString() }).eq("id", run.id);
          await logNode(supabase, run.id, node.id, node.type, "completed", null, Date.now() - t0);
          completedRuns++;
          runEnded = true;
          break;
        }

        if (node.type === "wait") {
          const sec = Number(node.config?.duration_seconds ?? 0);
          const next = node.config?.until_datetime ? new Date(node.config.until_datetime) : new Date(Date.now() + sec * 1000);
          const after = nextNodeId(graph, node.id);
          await supabase.from("workflow_runs").update({ current_node_id: after, next_action_at: next.toISOString() }).eq("id", run.id);
          await logNode(supabase, run.id, node.id, node.type, "completed", { wakes_at: next.toISOString() }, Date.now() - t0);
          runEnded = true;
          break;
        }

        if (node.type === "condition") {
          const ok = await evaluateCondition(supabase, run.contact_id, node.config ?? { rules: [] });
          const branchKey = ok ? "true" : "false";
          const branches = node.config?.branches ?? {};
          const target = branches[branchKey] ?? nextNodeId(graph, node.id, branchKey);
          await logNode(supabase, run.id, node.id, node.type, "completed", { result: ok }, Date.now() - t0);
          if (!target) {
            await supabase.from("workflow_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", run.id);
            completedRuns++; runEnded = true; break;
          }
          currentId = target;
          continue;
        }

        if (node.type === "split") {
          const variants = node.config?.variants ?? [];
          const total = variants.reduce((s: number, v: any) => s + (v.weight ?? 1), 0);
          let r = Math.random() * total;
          let chosen = variants[0];
          for (const v of variants) {
            r -= (v.weight ?? 1);
            if (r <= 0) { chosen = v; break; }
          }
          await logNode(supabase, run.id, node.id, node.type, "completed", { chosen_target: chosen?.target_node_id }, Date.now() - t0);
          if (!chosen?.target_node_id) {
            await supabase.from("workflow_runs").update({ status: "failed", error: "split has no variant", completed_at: new Date().toISOString() }).eq("id", run.id);
            failedRuns++; runEnded = true; break;
          }
          currentId = chosen.target_node_id;
          continue;
        }

        if (node.type === "action") {
          const result = await executeAction(supabase, run, node);
          if (result.error) {
            await logNode(supabase, run.id, node.id, node.type, "failed", { error: result.error }, Date.now() - t0);
            await supabase.from("workflow_runs").update({ status: "failed", error: result.error, completed_at: new Date().toISOString() }).eq("id", run.id);
            failedRuns++; runEnded = true; break;
          }
          await logNode(supabase, run.id, node.id, node.type, "completed", result.result ?? null, Date.now() - t0);
          if (result.end) {
            await supabase.from("workflow_runs").update({ status: result.end, completed_at: new Date().toISOString() }).eq("id", run.id);
            if (result.end === "completed") completedRuns++;
            runEnded = true; break;
          }
          if (result.pause) {
            await supabase.from("workflow_runs").update({ status: "paused", current_node_id: node.id, next_action_at: null }).eq("id", run.id);
            runEnded = true; break;
          }
          const after = nextNodeId(graph, node.id);
          if (!after) {
            await supabase.from("workflow_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", run.id);
            completedRuns++; runEnded = true; break;
          }
          currentId = after;
          continue;
        }

        // Unknown node type
        await logNode(supabase, run.id, node.id, node.type, "failed", { error: "unknown node type" }, Date.now() - t0);
        await supabase.from("workflow_runs").update({ status: "failed", error: `unknown node type ${node.type}`, completed_at: new Date().toISOString() }).eq("id", run.id);
        failedRuns++; runEnded = true; break;
      }

      // Yielded mid-run (budget hit) — update current_node_id, next_action_at = now to be picked next tick
      if (!runEnded && currentId) {
        await supabase.from("workflow_runs").update({ current_node_id: currentId, next_action_at: new Date().toISOString() }).eq("id", run.id);
      }
    }

    return new Response(JSON.stringify({ runs: runs.length, nodes: totalNodes, completed: completedRuns, failed: failedRuns }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("runner fatal:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

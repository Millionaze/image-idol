// webhook-receiver: public endpoint for inbound webhooks.
// POST /functions/v1/webhook-receiver?slug=<slug>  with optional X-Signature HMAC.
// Looks up endpoint by URL slug, verifies HMAC if configured, emits webhook.received event.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature",
};

async function hmacVerify(secret: string, payload: string, sig: string): Promise<boolean> {
  if (!sig) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expectedHex = Array.from(new Uint8Array(expected)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return expectedHex === sig;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return new Response(JSON.stringify({ error: "slug required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("direction", "inbound")
      .eq("url", slug)
      .eq("status", "active")
      .maybeSingle();

    if (!endpoint) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rawBody = await req.text();
    const sig = req.headers.get("x-signature") ?? "";
    if (endpoint.secret && sig) {
      const ok = await hmacVerify(endpoint.secret, rawBody, sig);
      if (!ok) return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let payload: any = {};
    try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch { payload = { raw: rawBody }; }

    const contactId = payload.contact_id ?? null;

    await supabase.from("webhook_deliveries").insert({
      endpoint_id: endpoint.id, direction: "inbound", payload, status: "success",
      response_status: 200, delivered_at: new Date().toISOString(),
    });

    await supabase.from("events").insert({
      user_id: endpoint.user_id,
      contact_id: contactId,
      event_type: "webhook.received",
      source: { endpoint_id: endpoint.id },
      payload,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("webhook-receiver error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

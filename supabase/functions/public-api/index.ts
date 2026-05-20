// Public REST API for Pixel Growth.
// Authenticated via Bearer pg_live_... API keys stored hashed in api_keys table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailViaAccount } from "../_shared/send-email-internal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (code: string, message: string, status: number) =>
  json({ error: { code, message } }, status);

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function authenticate(req: Request) {
  const h = req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer pg_live_")) return null;
  const token = h.slice("Bearer ".length).trim();
  const hash = await sha256Hex(token);
  const { data } = await admin
    .from("api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  // fire-and-forget last_used_at
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id).then(() => {});
  return { key_id: data.id as string, user_id: data.user_id as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  // strip /public-api prefix if present
  const path = url.pathname.replace(/^.*\/public-api/, "") || "/";

  const auth = await authenticate(req);
  if (!auth) return err("unauthorized", "Invalid or missing API key", 401);
  const { user_id } = auth;

  try {
    // GET /v1/accounts
    if (req.method === "GET" && path === "/v1/accounts") {
      const { data, error } = await admin
        .from("email_accounts")
        .select("id, email, name, warmup_enabled, reputation_score, status")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });
      if (error) return err("db_error", error.message, 500);
      return json({ accounts: data });
    }

    // POST /v1/campaigns
    if (req.method === "POST" && path === "/v1/campaigns") {
      const body = await req.json().catch(() => null);
      if (!body) return err("bad_request", "Invalid JSON body", 400);
      const { name, account_id, subject, body: emailBody, daily_limit, sequences } = body;
      if (!name || !account_id || !subject || !emailBody)
        return err("bad_request", "name, account_id, subject, body are required", 400);

      const { data: account } = await admin
        .from("email_accounts")
        .select("id, warmup_enabled, reputation_score")
        .eq("id", account_id).eq("user_id", user_id).maybeSingle();
      if (!account) return err("not_found", "account_id not found", 404);

      const warnings: string[] = [];
      if (!account.warmup_enabled) warnings.push("Sending account does not have warmup enabled.");
      if ((account.reputation_score ?? 0) < 50) warnings.push("Sending account reputation is below 50.");

      const isSequence = Array.isArray(sequences) && sequences.length > 0;
      const { data: campaign, error: cErr } = await admin
        .from("campaigns")
        .insert({
          user_id, account_id, name, subject, body: emailBody,
          daily_limit: daily_limit ?? 50,
          is_sequence: isSequence,
          status: "draft",
        })
        .select("id").single();
      if (cErr) return err("db_error", cErr.message, 500);

      if (isSequence) {
        const rows = sequences.map((s: any, i: number) => ({
          campaign_id: campaign.id,
          step_number: s.step_number ?? i + 1,
          subject: s.subject ?? subject,
          body: s.body ?? emailBody,
          delay_days: s.delay_days ?? 1,
        }));
        const { error: sErr } = await admin.from("campaign_sequences").insert(rows);
        if (sErr) return err("db_error", sErr.message, 500);
      }

      return json({ campaign_id: campaign.id, warnings }, 201);
    }

    // POST /v1/campaigns/:id/contacts
    let m = path.match(/^\/v1\/campaigns\/([0-9a-f-]+)\/contacts$/);
    if (req.method === "POST" && m) {
      const campaign_id = m[1];
      const body = await req.json().catch(() => null);
      const contacts = body?.contacts;
      if (!Array.isArray(contacts) || contacts.length === 0)
        return err("bad_request", "contacts array required", 400);
      if (contacts.length > 1000)
        return err("bad_request", "Max 1000 contacts per call", 400);

      const { data: camp } = await admin.from("campaigns")
        .select("id").eq("id", campaign_id).eq("user_id", user_id).maybeSingle();
      if (!camp) return err("not_found", "campaign not found", 404);

      const rows = contacts
        .filter((c: any) => c?.email)
        .map((c: any) => ({
          campaign_id,
          email: String(c.email).trim().toLowerCase(),
          name: c.name ?? null,
        }));
      const { error: iErr, count } = await admin.from("contacts")
        .insert(rows, { count: "exact" });
      if (iErr) return err("db_error", iErr.message, 500);
      return json({ inserted: count ?? rows.length });
    }

    // POST /v1/campaigns/:id/launch
    m = path.match(/^\/v1\/campaigns\/([0-9a-f-]+)\/launch$/);
    if (req.method === "POST" && m) {
      const campaign_id = m[1];
      const { data: camp } = await admin.from("campaigns")
        .select("id, is_sequence").eq("id", campaign_id).eq("user_id", user_id).maybeSingle();
      if (!camp) return err("not_found", "campaign not found", 404);

      const { error: uErr } = await admin.from("campaigns")
        .update({ status: "active", paused_reason: null })
        .eq("id", campaign_id);
      if (uErr) return err("db_error", uErr.message, 500);

      // Trigger immediate send for non-sequence; sequences are picked up by cron.
      if (!camp.is_sequence) {
        const baseUrl = Deno.env.get("SUPABASE_URL")!;
        fetch(`${baseUrl}/functions/v1/send-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ campaign_id }),
        }).catch(() => {});
      }
      return json({ status: "active", campaign_id });
    }

    // POST /v1/emails/send
    if (req.method === "POST" && path === "/v1/emails/send") {
      const body = await req.json().catch(() => null);
      const { account_id, to, subject, html } = body ?? {};
      if (!account_id || !to || !subject || !html)
        return err("bad_request", "account_id, to, subject, html required", 400);

      const { data: account } = await admin.from("email_accounts")
        .select("*").eq("id", account_id).eq("user_id", user_id).maybeSingle();
      if (!account) return err("not_found", "account not found", 404);

      const result = await sendEmailViaAccount({
        account,
        to,
        subject,
        htmlBody: html,
        trackOpens: false,
      });
      if (!result.success) return err("send_failed", result.error ?? "send failed", 502);
      return json({ sent: true });
    }

    return err("not_found", `No route for ${req.method} ${path}`, 404);
  } catch (e: any) {
    console.error("public-api error", e);
    return err("internal_error", e?.message ?? "internal error", 500);
  }
});

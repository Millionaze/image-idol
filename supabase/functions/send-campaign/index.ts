import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  sanitizeForSmtp,
  sanitizeSubject,
  htmlToText,
  classifySmtpError,
} from "../_shared/smtp-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), { status: 400, headers: corsHeaders });
    }

    const { data: campaign, error: cErr } = await supabase.from("campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers: corsHeaders });
    }

    const { data: account } = await supabase.from("email_accounts").select("*").eq("id", campaign.account_id).single();
    if (!account) {
      return new Response(JSON.stringify({ error: "Sending account not found" }), { status: 404, headers: corsHeaders });
    }

    // ── Warmup Readiness Gate ─────────────────────────────────────────
    const { data: latestScore } = await supabaseAdmin
      .from("warmup_scores")
      .select("score")
      .eq("account_id", account.id)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestScore) {
      if (latestScore.score < 50) {
        return new Response(JSON.stringify({
          error: "Account warmup score too low",
          score: latestScore.score,
          hard_block: true,
          message: `This account has a warmup readiness score of ${latestScore.score}/100. Sending campaigns is blocked until score reaches at least 50.`,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (latestScore.score < 70) {
        // Check if user explicitly opted to override
        const reqBody = await req.clone().json().catch(() => ({}));
        if (!reqBody.force_send) {
          return new Response(JSON.stringify({
            error: "Account warmup score below recommended threshold",
            score: latestScore.score,
            allow_override: true,
            message: `This account is only ${latestScore.score}% warmed up. Sending campaigns now may hurt your sender reputation. Re-send with force_send: true to proceed.`,
          }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const { data: pendingContacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .limit(campaign.daily_limit);

    if (!pendingContacts || pendingContacts.length === 0) {
      return new Response(JSON.stringify({ message: "No pending contacts to send" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabaseAdmin.from("campaigns").update({ status: "sending" }).eq("id", campaign_id);

    // Check for custom tracking domain
    let trackBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-open`;
    try {
      const { data: userSettings } = await supabaseAdmin
        .from("settings")
        .select("tracking_domain, tracking_domain_verified")
        .eq("user_id", user.id)
        .maybeSingle();
      if (userSettings?.tracking_domain && userSettings?.tracking_domain_verified) {
        trackBaseUrl = `https://${userSettings.tracking_domain}/functions/v1/track-open`;
      }
    } catch (e) {
      console.error("Failed to load tracking domain settings:", e);
    }

    const client = new SMTPClient({
      connection: {
        hostname: account.smtp_host,
        port: account.smtp_port,
        tls: account.smtp_secure,
        auth: { username: account.username, password: account.password },
      },
    });

    let sentCount = 0;
    let bounceCount = 0;
    let failedCount = 0;

    for (const contact of pendingContacts) {
      try {
        const contactName = contact.name || contact.email.split("@")[0];

        const rawSubject = campaign.subject
          .replace(/\{\{name\}\}/g, contactName)
          .replace(/\{\{email\}\}/g, contact.email);
        const subject = sanitizeSubject(rawSubject);

        const trackingPixel = `<img src="${trackBaseUrl}?id=${contact.id}" width="1" height="1" style="display:none;border:0;" alt="" />`;
        const rawBody = campaign.body
          .replace(/\{\{name\}\}/g, contactName)
          .replace(/\{\{email\}\}/g, contact.email) + trackingPixel;
        const html = sanitizeForSmtp(rawBody);
        const text = htmlToText(rawBody);

        await client.send({
          from: account.email,
          to: contact.email,
          subject,
          content: text,
          html,
        });

        await supabaseAdmin.from("contacts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", contact.id);
        sentCount++;

        // Emit workflow events
        await supabaseAdmin.from("events").insert([
          { user_id: user.id, contact_id: contact.id, event_type: "campaign.started", source: { campaign_id: campaign_id }, payload: {} },
          { user_id: user.id, contact_id: contact.id, event_type: "email.sent", source: { campaign_id: campaign_id, account_id: account.id }, payload: { subject } },
        ]);

        if (sentCount < pendingContacts.length) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        const classified = classifySmtpError(e);
        console.error(`Send failed for ${contact.email} [${classified.kind} code=${classified.code}]:`, classified.message);

        if (classified.kind === "bounced") {
          await supabaseAdmin.from("contacts").update({ status: "bounced" }).eq("id", contact.id);
          bounceCount++;
        } else if (classified.kind === "transient") {
          // leave as pending so it retries on the next run
          failedCount++;
        } else {
          await supabaseAdmin.from("contacts").update({ status: "failed" }).eq("id", contact.id);
          failedCount++;
        }

        await supabaseAdmin.from("events").insert({
          user_id: user.id, contact_id: contact.id,
          event_type: classified.kind === "bounced" ? "email.bounced" : "email.failed",
          source: { campaign_id: campaign_id },
          payload: { error: classified.message, code: classified.code, kind: classified.kind },
        });

        // SMTP DATA-mode failures kill the connection — stop the batch and let
        // the next run reopen a fresh client instead of marking everyone failed.
        if (classified.connectionFatal) {
          console.error("SMTP connection no longer recoverable — aborting batch.");
          break;
        }
      }
    }

    try { await client.close(); } catch (_) { /* ignore */ }

    await supabaseAdmin.from("campaigns").update({
      sent_count: campaign.sent_count + sentCount,
      bounce_count: campaign.bounce_count + bounceCount,
      status: "active",
    }).eq("id", campaign_id);

    return new Response(JSON.stringify({
      message: `Sent ${sentCount}, bounced ${bounceCount}, failed ${failedCount}`,
      sent: sentCount, bounced: bounceCount, failed: failedCount,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

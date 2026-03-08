import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

    const trackBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-open`;

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

    for (const contact of pendingContacts) {
      try {
        const contactName = contact.name || contact.email.split("@")[0];

        const subject = campaign.subject
          .replace(/\{\{name\}\}/g, contactName)
          .replace(/\{\{email\}\}/g, contact.email);

        const trackingPixel = `<img src="${trackBaseUrl}?id=${contact.id}" width="1" height="1" style="display:none;border:0;" alt="" />`;
        const body = campaign.body
          .replace(/\{\{name\}\}/g, contactName)
          .replace(/\{\{email\}\}/g, contact.email) + trackingPixel;

        await client.send({
          from: account.email,
          to: contact.email,
          subject,
          content: "auto",
          html: body,
        });

        await supabaseAdmin.from("contacts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", contact.id);
        sentCount++;

        if (sentCount < pendingContacts.length) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        console.error(`Failed to send to ${contact.email}:`, e);
        await supabaseAdmin.from("contacts").update({ status: "bounced" }).eq("id", contact.id);
        bounceCount++;
      }
    }

    await client.close();

    await supabaseAdmin.from("campaigns").update({
      sent_count: campaign.sent_count + sentCount,
      bounce_count: campaign.bounce_count + bounceCount,
      status: "active",
    }).eq("id", campaign_id);

    return new Response(JSON.stringify({ message: `Sent ${sentCount} emails, ${bounceCount} bounced` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

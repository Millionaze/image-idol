import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { data: claims, error: authError } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { campaign_id } = await req.json();
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), { status: 400, headers: corsHeaders });
    }

    // Get campaign
    const { data: campaign, error: cErr } = await supabase.from("campaigns").select("*").eq("id", campaign_id).single();
    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers: corsHeaders });
    }

    // Get sending account
    const { data: account } = await supabase.from("email_accounts").select("*").eq("id", campaign.account_id).single();
    if (!account) {
      return new Response(JSON.stringify({ error: "Sending account not found" }), { status: 404, headers: corsHeaders });
    }

    // Get pending contacts up to daily limit
    const { data: pendingContacts } = await supabase
      .from("contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .limit(campaign.daily_limit);

    if (!pendingContacts || pendingContacts.length === 0) {
      return new Response(JSON.stringify({ message: "No pending contacts to send" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update campaign status
    await supabase.from("campaigns").update({ status: "sending" }).eq("id", campaign_id);

    const baseUrl = Deno.env.get("SUPABASE_URL")!.replace("/rest/v1", "");
    const functionsUrl = `${Deno.env.get("SUPABASE_URL")!.split(".supabase.co")[0]}.supabase.co/functions/v1`;

    const client = new SMTPClient({
      connection: {
        hostname: account.smtp_host,
        port: account.smtp_port,
        tls: account.smtp_secure,
        auth: { username: account.username, password: account.password },
      },
    });

    let sentCount = 0;

    for (const contact of pendingContacts) {
      try {
        // Personalize subject and body
        const subject = campaign.subject
          .replace(/\{\{name\}\}/g, contact.name || "")
          .replace(/\{\{email\}\}/g, contact.email);
        
        const trackingPixel = `<img src="${functionsUrl}/track-open?id=${contact.id}" width="1" height="1" style="display:none" />`;
        const body = campaign.body
          .replace(/\{\{name\}\}/g, contact.name || "")
          .replace(/\{\{email\}\}/g, contact.email) + trackingPixel;

        await client.send({
          from: account.email,
          to: contact.email,
          subject,
          content: "auto",
          html: body,
        });

        await supabase.from("contacts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", contact.id);
        sentCount++;

        // 1.5 second delay between emails
        if (sentCount < pendingContacts.length) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        console.error(`Failed to send to ${contact.email}:`, e);
        await supabase.from("contacts").update({ status: "bounced" }).eq("id", contact.id);
        await supabase.from("campaigns").update({ bounce_count: campaign.bounce_count + 1 }).eq("id", campaign_id);
      }
    }

    await client.close();

    // Update campaign counts
    await supabase.from("campaigns").update({
      sent_count: campaign.sent_count + sentCount,
      status: "active",
    }).eq("id", campaign_id);

    return new Response(JSON.stringify({ message: `Sent ${sentCount} emails` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

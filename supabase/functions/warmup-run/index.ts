import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WARMUP_SUBJECTS = [
  "Quick question for you",
  "Following up on our conversation",
  "Hope you're doing well!",
  "Just checking in",
  "Wanted to touch base",
  "A quick thought",
  "How's everything going?",
  "Got a minute?",
  "Something interesting I found",
  "Thought of you today",
  "Any updates on your end?",
  "Let's catch up soon",
];

const WARMUP_BODIES = [
  "Hey! Just wanted to check in and see how things are going on your end. Hope you're having a great week!",
  "Hi there! I was thinking about our last chat and wanted to follow up. Let me know if you have any updates!",
  "Hope everything is going well! Just dropping a quick note to stay in touch. Talk soon!",
  "Hey, just a friendly check-in. How's the week treating you? Would love to catch up when you get a chance.",
  "Hi! Wanted to reach out and say hello. Let me know if there's anything interesting happening on your side!",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check auth if called from frontend
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { error } = await supabaseUser.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (error) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
    }

    // Get all accounts with warmup enabled
    const { data: accounts } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("warmup_enabled", true);

    if (!accounts || accounts.length < 2) {
      return new Response(JSON.stringify({ message: "Need at least 2 warmup-enabled accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (let i = 0; i < accounts.length; i++) {
      const sender = accounts[i];
      if (sender.warmup_sent_today >= sender.warmup_daily_limit) continue;

      // Pick a random recipient (not self)
      const recipients = accounts.filter((a) => a.id !== sender.id);
      const recipient = recipients[Math.floor(Math.random() * recipients.length)];

      const subject = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
      const body = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];

      try {
        const client = new SMTPClient({
          connection: {
            hostname: sender.smtp_host,
            port: sender.smtp_port,
            tls: sender.smtp_secure,
            auth: { username: sender.username, password: sender.password },
          },
        });

        await client.send({
          from: sender.email,
          to: recipient.email,
          subject,
          content: body,
        });

        await client.close();

        // Update sender stats
        await supabaseAdmin.from("email_accounts").update({
          warmup_sent_today: sender.warmup_sent_today + 1,
          warmup_total_sent: sender.warmup_total_sent + 1,
          reputation_score: Math.min(100, sender.reputation_score + 1),
        }).eq("id", sender.id);

        // Update recipient stats
        await supabaseAdmin.from("email_accounts").update({
          warmup_total_received: recipient.warmup_total_received + 1,
        }).eq("id", recipient.id);

        // Log
        await supabaseAdmin.from("warmup_logs").insert({
          account_id: sender.id,
          type: "sent",
          partner_email: recipient.email,
          subject,
          status: "success",
        });

        totalSent++;
      } catch (e: any) {
        console.error(`Warmup send failed from ${sender.email}:`, e.message);
        await supabaseAdmin.from("warmup_logs").insert({
          account_id: sender.id,
          type: "sent",
          partner_email: recipient.email,
          subject,
          status: "failed",
        });
      }
    }

    return new Response(JSON.stringify({ message: `Warmup complete: ${totalSent} emails sent` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

const WARMUP_BODIES_SHORT = [
  "Hey! Just checking in. Hope all is well!",
  "Hi! Quick hello — let me know if you need anything.",
  "Hope your week is going great!",
];

const WARMUP_BODIES_MEDIUM = [
  "Hey! Just wanted to check in and see how things are going on your end. Hope you're having a great week!",
  "Hi there! I was thinking about our last chat and wanted to follow up. Let me know if you have any updates!",
  "Hope everything is going well! Just dropping a quick note to stay in touch. Talk soon!",
  "Hey, just a friendly check-in. How's the week treating you? Would love to catch up when you get a chance.",
];

const WARMUP_BODIES_LONG = [
  "Hi! Wanted to reach out and say hello. I've been pretty busy lately but wanted to make sure we stay in touch. There's been a lot happening on my end, and I'd love to hear what you've been up to as well. Let me know when you have a few minutes to chat!",
  "Hey there! I hope this message finds you well. I was just thinking about some of the things we discussed last time, and I thought it would be great to reconnect. If you have any updates or just want to catch up, I'm always happy to hear from you. Looking forward to your reply!",
  "Good to hear from you recently. I've been working on some interesting projects and wanted to share a few thoughts. It would be great to get your perspective on things. Also, I saw something online that reminded me of our conversation. Let me know if you want me to forward it along!",
];

function pickRandomBody(): string {
  const roll = Math.random();
  if (roll < 0.3) return WARMUP_BODIES_SHORT[Math.floor(Math.random() * WARMUP_BODIES_SHORT.length)];
  if (roll < 0.7) return WARMUP_BODIES_MEDIUM[Math.floor(Math.random() * WARMUP_BODIES_MEDIUM.length)];
  return WARMUP_BODIES_LONG[Math.floor(Math.random() * WARMUP_BODIES_LONG.length)];
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function randomVariance(target: number): number {
  const variance = Math.floor(target * 0.2);
  return Math.max(1, target + Math.floor(Math.random() * (variance * 2 + 1)) - variance);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional auth check for frontend calls
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
    }

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

      // Skip weekends if weekdays only
      if (sender.warmup_weekdays_only && isWeekend()) continue;

      // Calculate daily target from ramp
      const rampDay = sender.warmup_ramp_day || 1;
      const rampTarget = Math.min(rampDay * 2, sender.warmup_daily_limit);
      const dailyTarget = randomVariance(rampTarget);

      if (sender.warmup_sent_today >= dailyTarget) continue;

      const recipients = accounts.filter((a: any) => a.id !== sender.id);
      const recipient = recipients[Math.floor(Math.random() * recipients.length)];

      let subject = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
      let body = pickRandomBody();

      // Check if AI warmup content is enabled for this user
      try {
        const { data: userSettings } = await supabaseAdmin
          .from("settings")
          .select("ai_warmup_enabled")
          .eq("user_id", sender.user_id)
          .maybeSingle();

        if (userSettings?.ai_warmup_enabled) {
          const aiResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-warmup-content`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          if (aiResp.ok) {
            const aiContent = await aiResp.json();
            if (aiContent.subject) subject = aiContent.subject;
            if (aiContent.body) body = aiContent.body;
          }
        }
      } catch (aiErr) {
        console.error("AI warmup content fallback to hardcoded:", aiErr);
      }

      // Random jitter 0-45 minutes (in ms) — applied as delay between sends
      const jitter = Math.floor(Math.random() * 45 * 60 * 1000);

      try {
        // Apply jitter delay (capped at 5s for manual runs, full jitter for cron)
        const isManualRun = authHeader?.startsWith("Bearer ");
        const delay = isManualRun ? Math.min(jitter, 5000) : Math.min(jitter, 30000);
        if (delay > 0 && i > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }

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
        const updateData: any = {
          warmup_sent_today: sender.warmup_sent_today + 1,
          warmup_total_sent: sender.warmup_total_sent + 1,
          reputation_score: Math.min(100, sender.reputation_score + 1),
        };
        // Set warmup_start_date if not set
        if (!sender.warmup_start_date) {
          updateData.warmup_start_date = new Date().toISOString();
        }
        await supabaseAdmin.from("email_accounts").update(updateData).eq("id", sender.id);

        await supabaseAdmin.from("email_accounts").update({
          warmup_total_received: recipient.warmup_total_received + 1,
        }).eq("id", recipient.id);

        // Log the send
        await supabaseAdmin.from("warmup_logs").insert({
          account_id: sender.id,
          type: "sent",
          partner_email: recipient.email,
          subject,
          status: "success",
        });

        totalSent++;

        // Behavioral signals: mark as important
        if (Math.random() * 100 < (sender.mark_important_rate || 30)) {
          await supabaseAdmin.from("warmup_logs").insert({
            account_id: recipient.id,
            type: "marked_important",
            partner_email: sender.email,
            subject,
            status: "success",
          });
        }

        // Behavioral signals: spam rescue
        if (Math.random() * 100 < (sender.spam_rescue_rate || 20)) {
          await supabaseAdmin.from("warmup_logs").insert({
            account_id: recipient.id,
            type: "rescued_from_spam",
            partner_email: sender.email,
            subject,
            status: "success",
          });
        }
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

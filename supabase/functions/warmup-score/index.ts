import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function detectProvider(smtpHost: string): string {
  const h = smtpHost.toLowerCase();
  if (h.includes("gmail") || h.includes("google")) return "gmail";
  if (h.includes("outlook") || h.includes("office365") || h.includes("hotmail")) return "outlook";
  return "custom";
}

function scoreInboxRate(rate: number, maxPoints: number): number {
  if (rate >= 95) return maxPoints;
  if (rate >= 85) return Math.floor(maxPoints * 0.72);
  if (rate >= 70) return Math.floor(maxPoints * 0.4);
  return 0;
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

    const { data: accounts } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("warmup_enabled", true);

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No warmup accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let scored = 0;

    for (const account of accounts) {
      try {
        // Get warmup logs for last 7 days
        const { data: logs } = await supabaseAdmin
          .from("warmup_logs")
          .select("type, partner_email, status")
          .eq("account_id", account.id)
          .gte("created_at", sevenDaysAgo);

        // Get partner accounts to determine provider
        const { data: partners } = await supabaseAdmin
          .from("warmup_partnerships")
          .select("partner_account_id, provider_type")
          .eq("account_id", account.id);

        const partnerProviders = new Map<string, string>();
        if (partners) {
          for (const p of partners) {
            // We need the partner's email to map logs
            const { data: partnerAcc } = await supabaseAdmin
              .from("email_accounts")
              .select("email, smtp_host")
              .eq("id", p.partner_account_id)
              .single();
            if (partnerAcc) {
              partnerProviders.set(partnerAcc.email.toLowerCase(), detectProvider(partnerAcc.smtp_host));
            }
          }
        }

        // Calculate inbox rates by provider
        const sentLogs = logs?.filter(l => l.type === "sent" && l.status === "success") || [];
        const rescueLogs = logs?.filter(l => l.type === "rescued_from_spam") || [];

        let gmailSent = 0, gmailSpam = 0, outlookSent = 0, outlookSpam = 0;

        for (const log of sentLogs) {
          const provider = partnerProviders.get(log.partner_email?.toLowerCase() || "");
          if (provider === "gmail") gmailSent++;
          else if (provider === "outlook") outlookSent++;
        }

        for (const log of rescueLogs) {
          const provider = partnerProviders.get(log.partner_email?.toLowerCase() || "");
          if (provider === "gmail") gmailSpam++;
          else if (provider === "outlook") outlookSpam++;
        }

        const gmailInboxRate = gmailSent > 0 ? ((gmailSent - gmailSpam) / gmailSent) * 100 : 100;
        const outlookInboxRate = outlookSent > 0 ? ((outlookSent - outlookSpam) / outlookSent) * 100 : 100;

        // Gmail score (25 pts)
        const gmailScore = scoreInboxRate(gmailInboxRate, 25);

        // Outlook score (25 pts)
        const outlookScore = scoreInboxRate(outlookInboxRate, 25);

        // Reply rate (20 pts)
        const { data: threads } = await supabaseAdmin
          .from("warmup_threads")
          .select("message_count")
          .or(`account_a.eq.${account.id},account_b.eq.${account.id}`)
          .gte("created_at", sevenDaysAgo);

        const totalThreads = threads?.length || 0;
        const repliedThreads = threads?.filter(t => t.message_count >= 2).length || 0;
        const replyRate = totalThreads > 0 ? (repliedThreads / totalThreads) * 100 : 0;

        let replyScore = 0;
        if (replyRate >= 70) replyScore = 20;
        else if (replyRate >= 50) replyScore = 14;
        else if (replyRate >= 30) replyScore = 8;

        // Rescue rate (15 pts)
        const { data: rescues } = await supabaseAdmin
          .from("warmup_rescues")
          .select("rescue_success")
          .eq("sending_account_id", account.id)
          .gte("created_at", sevenDaysAgo);

        const totalRescues = rescues?.length || 0;
        const successRescues = rescues?.filter(r => r.rescue_success).length || 0;
        const rescueRate = totalRescues > 0 ? (successRescues / totalRescues) * 100 : 100;

        let rescueScore = 0;
        if (rescueRate >= 95) rescueScore = 15;
        else if (rescueRate >= 80) rescueScore = 10;
        else if (rescueRate >= 60) rescueScore = 5;

        // DNS health (10 pts)
        const domain = account.email.split("@")[1];
        const { data: dnsCheck } = await supabaseAdmin
          .from("dns_health_log")
          .select("spf_status, dkim_status, dmarc_status")
          .eq("domain", domain)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let dnsScore = 0;
        if (dnsCheck) {
          const validCount = [dnsCheck.spf_status, dnsCheck.dkim_status, dnsCheck.dmarc_status].filter(Boolean).length;
          if (validCount === 3) dnsScore = 10;
          else if (validCount === 2) dnsScore = 5;
        }

        // Age score (5 pts)
        let ageScore = 0;
        if (account.warmup_start_date) {
          const daysSinceStart = Math.floor((now.getTime() - new Date(account.warmup_start_date).getTime()) / (24 * 60 * 60 * 1000));
          if (daysSinceStart >= 21) ageScore = 5;
          else if (daysSinceStart >= 14) ageScore = 3;
          else if (daysSinceStart >= 7) ageScore = 1;
        }

        const totalScore = gmailScore + outlookScore + replyScore + rescueScore + dnsScore + ageScore;

        // Store score
        await supabaseAdmin.from("warmup_scores").insert({
          account_id: account.id,
          score: totalScore,
          gmail_score: gmailScore,
          outlook_score: outlookScore,
          reply_score: replyScore,
          rescue_score: rescueScore,
          dns_score: dnsScore,
          age_score: ageScore,
        });

        // Update account reputation and status
        const updates: any = { reputation_score: totalScore };
        if (totalScore >= 85 && account.warmup_status === "active") {
          updates.warmup_status = "graduated";
        }
        await supabaseAdmin.from("email_accounts").update(updates).eq("id", account.id);

        scored++;
      } catch (accErr: any) {
        console.error(`Score calculation failed for ${account.email}:`, accErr.message);
      }
    }

    return new Response(JSON.stringify({ message: `Scored ${scored} accounts` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("warmup-score error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

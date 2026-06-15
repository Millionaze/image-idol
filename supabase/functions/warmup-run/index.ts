import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isWithinSendingHours(): boolean {
  const hour = new Date().getUTCHours();
  return hour >= 7 && hour < 20;
}

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function detectProvider(smtpHost: string): string {
  const h = smtpHost.toLowerCase();
  if (h.includes("gmail") || h.includes("google")) return "gmail";
  if (h.includes("outlook") || h.includes("office365") || h.includes("hotmail") || h.includes("live.com")) return "outlook";
  return "custom";
}

function rampDailyLimit(rampDay: number, maxVolume: number): number {
  return Math.min(Math.floor(2 * Math.pow(1.3, rampDay)), maxVolume);
}

/** Pick a random behavioral action based on probability distribution */
function pickAction(): "read_reply" | "read_only" | "important_reply" | "star_reply" | "nothing" {
  const roll = Math.random() * 100;
  if (roll < 55) return "read_reply";
  if (roll < 75) return "read_only";
  if (roll < 90) return "important_reply";
  if (roll < 97) return "star_reply";
  return "nothing";
}

function randomReplyDelay(): number {
  // Between 8 minutes and 5 hours in milliseconds
  return randomBetween(8 * 60 * 1000, 5 * 60 * 60 * 1000);
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Optional auth for manual frontend triggers
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

    if (!isWithinSendingHours()) {
      return new Response(JSON.stringify({ message: "Outside sending hours (7am-8pm UTC)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all warmup-eligible accounts
    const { data: accounts } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("warmup_enabled", true)
      .in("warmup_status", ["active", "graduated", "maintenance"]);

    if (!accounts || accounts.length < 2) {
      return new Response(JSON.stringify({ message: "Need at least 2 warmup-enabled accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    let totalReplies = 0;

    // ── Phase 1: Process pending thread replies ──────────────────────────

    const now = new Date();
    const { data: pendingReplies } = await supabaseAdmin
      .from("warmup_threads")
      .select("*")
      .eq("status", "open")
      .not("next_reply_by", "is", null)
      .lte("next_reply_at", now.toISOString())
      .lt("message_count", 4);

    if (pendingReplies && pendingReplies.length > 0) {
      for (const thread of pendingReplies) {
        const replier = accounts.find((a: any) => a.id === thread.next_reply_by);
        const otherAccountId = thread.next_reply_by === thread.account_a ? thread.account_b : thread.account_a;
        const otherAccount = accounts.find((a: any) => a.id === otherAccountId);

        if (!replier || !otherAccount) continue;

        // Check daily limit
        const dailyTarget = replier.warmup_status === "graduated"
          ? randomBetween(5, 8)
          : rampDailyLimit(replier.warmup_ramp_day || 1, replier.warmup_daily_limit);
        if (replier.warmup_sent_today >= dailyTarget) continue;

        // Behavioral action for this reply
        const action = pickAction();
        if (action === "nothing") {
          // Close thread — "human" ignored it
          await supabaseAdmin.from("warmup_threads")
            .update({ status: "closed" })
            .eq("id", thread.id);
          continue;
        }
        if (action === "read_only") {
          // Log as received/read but no reply — close thread
          await supabaseAdmin.from("warmup_logs").insert({
            account_id: replier.id, type: "received",
            partner_email: otherAccount.email,
            subject: `Re: Thread ${thread.thread_id.substring(0, 8)}`,
            status: "success",
          });
          await supabaseAdmin.from("warmup_threads")
            .update({ status: "closed" })
            .eq("id", thread.id);
          continue;
        }

        // Generate reply content
        try {
          const { data: userSettings } = await supabaseAdmin
            .from("settings")
            .select("ai_warmup_enabled")
            .eq("user_id", replier.user_id)
            .maybeSingle();

          let replyBody = "Thanks for following up! Everything is going well on my end. Let's connect soon.";
          if (userSettings?.ai_warmup_enabled) {
            const aiResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-warmup-content`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                is_reply: true,
                previous_message_summary: thread.previous_message_summary || "a casual check-in",
                persona: "professional",
                account_id: replier.id,
                last_reply_length: replier.last_reply_length || "medium",
              }),
            });
            if (aiResp.ok) {
              const aiContent = await aiResp.json();
              if (aiContent.body) replyBody = aiContent.body;
            }
          }

          // Send the reply via SMTP
          const client = new SMTPClient({
            connection: {
              hostname: replier.smtp_host, port: replier.smtp_port,
              tls: replier.smtp_secure,
              auth: { username: replier.username, password: replier.password },
            },
          });

          const replySubject = `Re: Thread ${thread.thread_id.substring(0, 8)}`;
          await client.send({
            from: replier.email,
            to: otherAccount.email,
            subject: replySubject,
            content: replyBody,
          });
          await client.close();

          // Log behavioral signals
          if (action === "important_reply") {
            await supabaseAdmin.from("warmup_logs").insert({
              account_id: replier.id, type: "marked_important",
              partner_email: otherAccount.email, subject: replySubject, status: "success",
            });
          }
          if (action === "star_reply") {
            await supabaseAdmin.from("warmup_logs").insert({
              account_id: replier.id, type: "marked_important",
              partner_email: otherAccount.email, subject: replySubject, status: "success",
            });
          }

          const newMsgCount = thread.message_count + 1;

          // Determine if thread continues
          let nextReplyBy: string | null = null;
          let nextReplyAt: string | null = null;
          let threadStatus = "open";

          if (newMsgCount >= 4) {
            threadStatus = "closed";
          } else if (newMsgCount === 2) {
            // 30% chance of message 3
            if (Math.random() < 0.3) {
              nextReplyBy = otherAccountId;
              nextReplyAt = new Date(now.getTime() + randomReplyDelay()).toISOString();
            } else {
              threadStatus = "closed";
            }
          } else if (newMsgCount === 3) {
            // 40% chance of message 4
            if (Math.random() < 0.4) {
              nextReplyBy = otherAccountId;
              nextReplyAt = new Date(now.getTime() + randomReplyDelay()).toISOString();
            } else {
              threadStatus = "closed";
            }
          }

          await supabaseAdmin.from("warmup_threads").update({
            message_count: newMsgCount,
            last_message_at: now.toISOString(),
            next_reply_by: nextReplyBy,
            next_reply_at: nextReplyAt,
            previous_message_summary: replyBody.substring(0, 200),
            status: threadStatus,
          }).eq("id", thread.id);

          // Update sender stats
          await supabaseAdmin.from("email_accounts").update({
            warmup_sent_today: replier.warmup_sent_today + 1,
            warmup_total_sent: replier.warmup_total_sent + 1,
          }).eq("id", replier.id);

          await supabaseAdmin.from("warmup_logs").insert({
            account_id: replier.id, type: "sent",
            partner_email: otherAccount.email, subject: replySubject, status: "success",
          });

          totalReplies++;
        } catch (e: any) {
          console.error(`Thread reply failed from ${replier.email}:`, e.message);
          await supabaseAdmin.from("warmup_logs").insert({
            account_id: replier.id, type: "sent",
            partner_email: otherAccount.email,
            subject: `Re: Thread ${thread.thread_id.substring(0, 8)}`,
            status: "failed",
          });
        }
      }
    }

    // ── Phase 2: New warmup sends ────────────────────────────────────────

    for (const sender of accounts) {
      if (sender.warmup_weekdays_only && isWeekend()) continue;
      if (sender.warmup_status === "dns_error") continue;

      // Calculate daily target based on status
      let dailyTarget: number;
      if (sender.warmup_status === "graduated" || sender.warmup_status === "maintenance") {
        // Maintenance mode: 5-8 emails/day base
        dailyTarget = randomBetween(5, 8);

        // Check campaign spam rate for boosted maintenance
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentLogs } = await supabaseAdmin
          .from("warmup_logs")
          .select("type")
          .eq("account_id", sender.id)
          .gte("created_at", oneDayAgo);

        if (recentLogs) {
          const spamCount = recentLogs.filter((l: any) => l.type === "rescued_from_spam").length;
          const totalCount = recentLogs.length || 1;
          const spamRate = (spamCount / totalCount) * 100;

          if (spamRate > 8) {
            dailyTarget = 25; // Emergency boost
            // Pause campaigns for this account
            await supabaseAdmin.from("campaigns")
              .update({ status: "paused" })
              .eq("account_id", sender.id)
              .eq("status", "active");
          } else if (spamRate > 4) {
            dailyTarget = 15; // Moderate boost
          }
        }
      } else {
        const rampDay = sender.warmup_ramp_day || 1;
        dailyTarget = rampDailyLimit(rampDay, sender.warmup_daily_limit);
      }

      if (sender.warmup_sent_today >= dailyTarget) continue;

      // ── Partner Selection (Network Diversity) ──────────────────────

      const today = new Date().toISOString().split("T")[0];

      // Get valid partnerships
      const { data: partnerships } = await supabaseAdmin
        .from("warmup_partnerships")
        .select("*")
        .eq("account_id", sender.id)
        .gte("expires_at", now.toISOString());

      let validPartnerIds: string[] = [];

      if (partnerships && partnerships.length > 0) {
        // Filter to partners with < 3 interactions today
        validPartnerIds = partnerships
          .filter((p: any) => p.last_interaction_date !== today || p.daily_interaction_count < 3)
          .map((p: any) => p.partner_account_id);
      }

      if (validPartnerIds.length === 0) {
        // Assign new partners with provider diversity
        const otherAccounts = accounts.filter((a: any) => a.id !== sender.id);
        if (otherAccounts.length === 0) continue;

        const gmailAccounts = otherAccounts.filter((a: any) => detectProvider(a.smtp_host) === "gmail");
        const outlookAccounts = otherAccounts.filter((a: any) => detectProvider(a.smtp_host) === "outlook");
        const customAccounts = otherAccounts.filter((a: any) => detectProvider(a.smtp_host) === "custom");

        // Build partner pool with target distribution
        const partnerPool: any[] = [];
        const targetCount = Math.min(otherAccounts.length, 10);

        // 40-50% Gmail
        const gmailTarget = Math.ceil(targetCount * 0.45);
        partnerPool.push(...gmailAccounts.slice(0, gmailTarget));
        // 30-35% Outlook
        const outlookTarget = Math.ceil(targetCount * 0.32);
        partnerPool.push(...outlookAccounts.slice(0, outlookTarget));
        // Fill rest with custom
        const remaining = targetCount - partnerPool.length;
        partnerPool.push(...customAccounts.slice(0, remaining));

        // If not enough from categories, fill from all
        if (partnerPool.length === 0) {
          partnerPool.push(...otherAccounts.slice(0, targetCount));
        }

        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

        for (const partner of partnerPool) {
          await supabaseAdmin.from("warmup_partnerships").insert({
            account_id: sender.id,
            partner_account_id: partner.id,
            provider_type: detectProvider(partner.smtp_host),
            expires_at: expiresAt,
            daily_interaction_count: 0,
          });
        }

        validPartnerIds = partnerPool.map((p: any) => p.id);
      }

      // Pick a random partner
      const recipientId = validPartnerIds[Math.floor(Math.random() * validPartnerIds.length)];
      const recipient = accounts.find((a: any) => a.id === recipientId);
      if (!recipient) continue;

      // Check if this pair has had a thread in the last 7 days
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentThreads } = await supabaseAdmin
        .from("warmup_threads")
        .select("id")
        .or(`and(account_a.eq.${sender.id},account_b.eq.${recipientId}),and(account_a.eq.${recipientId},account_b.eq.${sender.id})`)
        .gte("created_at", sevenDaysAgo)
        .limit(1);

      if (recentThreads && recentThreads.length > 0) {
        // Skip this pair — already had a thread recently
        continue;
      }

      // ── Generate Content ───────────────────────────────────────────

      let subject = "Quick check-in";
      let body = "Hey! Just wanted to check in. Hope everything is going well!";

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
            body: JSON.stringify({
              persona: "professional",
              account_id: sender.id,
              last_reply_length: sender.last_reply_length || "medium",
            }),
          });
          if (aiResp.ok) {
            const aiContent = await aiResp.json();
            if (aiContent.subject) subject = aiContent.subject;
            if (aiContent.body) body = aiContent.body;
          }
        }
      } catch (aiErr) {
        console.error("AI warmup content fallback:", aiErr);
      }

      // ── Send Email ─────────────────────────────────────────────────

      // Random jitter delay
      const isManualRun = authHeader?.startsWith("Bearer ");
      const jitter = isManualRun ? randomBetween(100, 3000) : randomBetween(2000, 30000);
      if (totalSent > 0) {
        await new Promise(r => setTimeout(r, jitter));
      }

      try {
        const client = new SMTPClient({
          connection: {
            hostname: sender.smtp_host, port: sender.smtp_port,
            tls: sender.smtp_secure,
            auth: { username: sender.username, password: sender.password },
          },
        });

        await client.send({ from: sender.email, to: recipient.email, subject, content: body });
        await client.close();

        // Create thread
        const threadId = crypto.randomUUID();
        const replyDelay = randomReplyDelay();
        const nextReplyAt = new Date(now.getTime() + replyDelay).toISOString();

        await supabaseAdmin.from("warmup_threads").insert({
          account_a: sender.id,
          account_b: recipient.id,
          thread_id: threadId,
          message_count: 1,
          last_message_at: now.toISOString(),
          next_reply_by: recipient.id,
          next_reply_at: nextReplyAt,
          previous_message_summary: body.substring(0, 200),
          status: "open",
        });

        // Update sender stats
        const updateData: any = {
          warmup_sent_today: sender.warmup_sent_today + 1,
          warmup_total_sent: sender.warmup_total_sent + 1,
          reputation_score: Math.min(100, sender.reputation_score + 1),
        };
        if (!sender.warmup_start_date) {
          updateData.warmup_start_date = now.toISOString();
        }
        await supabaseAdmin.from("email_accounts").update(updateData).eq("id", sender.id);

        // Update recipient stats
        await supabaseAdmin.from("email_accounts").update({
          warmup_total_received: recipient.warmup_total_received + 1,
        }).eq("id", recipient.id);

        // Update partnership interaction count
        await supabaseAdmin.from("warmup_partnerships")
          .update({ daily_interaction_count: 1, last_interaction_date: today })
          .eq("account_id", sender.id)
          .eq("partner_account_id", recipient.id)
          .gte("expires_at", now.toISOString());

        // Log
        await supabaseAdmin.from("warmup_logs").insert({
          account_id: sender.id, type: "sent",
          partner_email: recipient.email, subject, status: "success",
        });

        // Behavioral action for recipient
        const action = pickAction();
        if (action === "important_reply" || action === "star_reply") {
          await supabaseAdmin.from("warmup_logs").insert({
            account_id: recipient.id, type: "marked_important",
            partner_email: sender.email, subject, status: "success",
          });
        }

        totalSent++;
      } catch (e: any) {
        console.error(`Warmup send failed from ${sender.email}:`, e.message);
        await supabaseAdmin.from("warmup_logs").insert({
          account_id: sender.id, type: "sent",
          partner_email: recipient.email, subject, status: "failed",
        });
      }
    }

    // ── Phase 3: Increment ramp day (daily reset handled separately) ─

    // Ramp day is incremented once per day — check if warmup_start_date
    // means today is a new day vs the ramp_day count
    for (const account of accounts) {
      if (account.warmup_start_date && account.warmup_status === "active") {
        const startDate = new Date(account.warmup_start_date);
        const daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
        if (daysSinceStart > (account.warmup_ramp_day || 0)) {
          const newRampDay = daysSinceStart;
          const updates: any = { warmup_ramp_day: newRampDay };

          // Check graduation: reputation >= 85 and ramp >= 21
          if (account.reputation_score >= 85 && newRampDay >= 21) {
            updates.warmup_status = "graduated";
          }

          await supabaseAdmin.from("email_accounts").update(updates).eq("id", account.id);
        }
      }
    }

    return new Response(JSON.stringify({
      message: `Warmup complete: ${totalSent} new sends, ${totalReplies} thread replies`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("warmup-run error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

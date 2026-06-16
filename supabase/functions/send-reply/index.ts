import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailViaAccount } from "../_shared/send-email-internal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ensureRePrefix(subject: string | null): string {
  const s = (subject || "").trim();
  if (!s) return "Re: (no subject)";
  return /^re:\s*/i.test(s) ? s : `Re: ${s}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messageId: string = body.message_id;
    const replyText: string = (body.reply_text || "").toString();
    if (!messageId || !replyText.trim()) {
      return new Response(JSON.stringify({ error: "message_id and reply_text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: original, error: origErr } = await admin
      .from("inbox_messages").select("*").eq("id", messageId).single();
    if (origErr || !original) {
      return new Response(JSON.stringify({ error: "Original message not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: account, error: accErr } = await admin
      .from("email_accounts").select("*")
      .eq("id", original.account_id).eq("user_id", user.id).single();
    if (accErr || !account) {
      return new Response(JSON.stringify({ error: "Account not found or access denied" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const toAddr = original.from_email;
    if (!toAddr) {
      return new Response(JSON.stringify({ error: "Original message has no sender address" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = ensureRePrefix(original.subject);
    const headers: Record<string, string> = {};
    if (original.message_id) {
      headers["In-Reply-To"] = original.message_id;
      headers["References"] = original.references
        ? `${original.references} ${original.message_id}`
        : original.message_id;
    }

    const result = await sendEmailViaAccount({
      account,
      to: toAddr,
      subject,
      htmlBody: replyText,
      plainTextOnly: true,
      trackOpens: false,
      headers,
    });

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error || "Send failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin
      .from("inbox_messages")
      .update({ is_replied: true, replied_at: new Date().toISOString(), is_read: true })
      .eq("id", original.id);

    const outboundUid = `${account.id}:out:${crypto.randomUUID()}`;
    await admin.from("inbox_messages").insert({
      account_id: account.id,
      from_email: account.email,
      from_name: account.name || account.email,
      subject,
      body: replyText,
      received_at: new Date().toISOString(),
      message_uid: outboundUid,
      is_read: true,
      is_outbound: true,
      thread_id: original.thread_id || original.message_id || null,
      in_reply_to: original.message_id || null,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-reply error:", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

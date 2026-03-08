import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { error: authError } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authError) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { account_id } = await req.json();
    if (!account_id) {
      return new Response(JSON.stringify({ error: "account_id required" }), { status: 400, headers: corsHeaders });
    }

    // IMAP is complex in Deno — for now, return a message indicating this
    // The inbox UI is fully built and will work once real IMAP integration is added
    // For demo purposes, we can insert some sample messages
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const sampleMessages = [
      { account_id, from_email: "alice@example.com", from_name: "Alice Johnson", subject: "Re: Quick question", body: "Hey! Thanks for reaching out. Yes, I'd be happy to discuss this further. Let me know when you're free for a call.", received_at: new Date().toISOString() },
      { account_id, from_email: "bob@company.com", from_name: "Bob Smith", subject: "Follow up on proposal", body: "Hi there,\n\nI reviewed the proposal you sent over. I have a few questions about the timeline. Can we schedule a meeting this week?", received_at: new Date(Date.now() - 3600000).toISOString() },
      { account_id, from_email: "support@service.com", from_name: "Support Team", subject: "Your account has been updated", body: "Your account settings have been successfully updated. If you did not make this change, please contact us immediately.", received_at: new Date(Date.now() - 7200000).toISOString() },
    ];

    await supabaseAdmin.from("inbox_messages").insert(sampleMessages);

    return new Response(JSON.stringify({ message: "Synced 3 messages (demo mode — IMAP integration pending)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

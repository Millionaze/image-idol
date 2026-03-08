import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { account_id } = await req.json();
    if (!account_id) {
      return new Response(JSON.stringify({ error: "account_id required" }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Demo mode: insert realistic sample messages
    // Real IMAP sync requires a self-hosted backend with IMAP library support
    const now = Date.now();
    const sampleMessages = [
      { account_id, from_email: "alice@example.com", from_name: "Alice Johnson", subject: "Re: Quick question about your product", body: "Hey! Thanks for reaching out. Yes, I'd be happy to discuss this further. Let me know when you're free for a call this week.", received_at: new Date(now).toISOString() },
      { account_id, from_email: "bob@company.com", from_name: "Bob Smith", subject: "Follow up on proposal", body: "Hi there,\n\nI reviewed the proposal you sent over. I have a few questions about the timeline and budget. Can we schedule a meeting this week?\n\nBest,\nBob", received_at: new Date(now - 3600000).toISOString() },
      { account_id, from_email: "sarah@startup.io", from_name: "Sarah Chen", subject: "Partnership opportunity", body: "Hi!\n\nI came across your company and think there might be a great synergy between our products. Would you be open to a quick 15-minute intro call?\n\nCheers,\nSarah", received_at: new Date(now - 7200000).toISOString() },
      { account_id, from_email: "newsletter@techweekly.com", from_name: "Tech Weekly", subject: "This week in tech: AI breakthroughs", body: "Here's your weekly roundup of the most important tech news...\n\n1. New AI model beats benchmarks\n2. Startup raises $50M Series B\n3. Open source project hits 100k stars", received_at: new Date(now - 14400000).toISOString() },
      { account_id, from_email: "mike@agency.co", from_name: "Mike Torres", subject: "Campaign results are in!", body: "Great news! Your latest campaign outperformed expectations:\n\n- Open rate: 34%\n- Click rate: 8.2%\n- Reply rate: 2.1%\n\nLet me know if you want to discuss scaling this up.", received_at: new Date(now - 21600000).toISOString() },
      { account_id, from_email: "support@saasplatform.com", from_name: "SaaS Platform Support", subject: "Your subscription has been renewed", body: "Your monthly subscription has been successfully renewed. Amount: $49/month.\n\nIf you have any questions about your account, feel free to reach out.", received_at: new Date(now - 43200000).toISOString() },
    ];

    await supabaseAdmin.from("inbox_messages").insert(sampleMessages);

    return new Response(JSON.stringify({ message: "Synced 6 messages (demo mode — real IMAP sync requires a self-hosted backend)" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

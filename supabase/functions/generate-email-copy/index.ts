import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, ...params } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "copy") {
      const { product, audience, goal, tone, length } = params;
      systemPrompt = "You are an expert cold email copywriter. Generate 3 variations of a cold email.";
      userPrompt = `Product: ${product}. Target: ${audience}. Goal: ${goal}. Tone: ${tone}. Length: ${length}. For each variation return a JSON object with 'subject' and 'body' fields. Return only a JSON array, no other text.`;
    } else if (type === "follow-up") {
      const { originalSubject, originalBody, tone } = params;
      systemPrompt = "You are an expert cold email copywriter. Generate a follow-up email assuming no reply to the original.";
      userPrompt = `Original subject: ${originalSubject}. Original body: ${originalBody}. Tone: ${tone}. Return a JSON object with 'subject' and 'body' fields. Return only JSON, no other text.`;
    } else if (type === "subject-rewrite") {
      const { subject } = params;
      systemPrompt = "You are an email deliverability expert.";
      userPrompt = `Rewrite this subject line 3 ways to improve deliverability and open rate. Original: '${subject}'. Return only a JSON array of 3 strings.`;
    } else if (type === "spintax") {
      const { body } = params;
      systemPrompt = "You are an email variation expert.";
      userPrompt = `Take this email and rewrite it with spintax. Identify 5-8 phrases that could naturally vary across recipients. Return the full email with spintax syntax {option1|option2} applied. Email: '${body}'. Return only the rewritten email text, no explanation.`;
    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-email-copy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

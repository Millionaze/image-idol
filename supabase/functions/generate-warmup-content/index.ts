const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate subject
    const subjectResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Generate a short casual email subject line (4-7 words). Natural, human-sounding. Never mention products, marketing, or sales. Return only the subject line, nothing else." },
          { role: "user", content: "Generate a unique email subject line." },
        ],
      }),
    });

    if (!subjectResp.ok) {
      const errText = await subjectResp.text();
      console.error("AI subject error:", subjectResp.status, errText);
      throw new Error("Failed to generate subject");
    }

    const subjectData = await subjectResp.json();
    const subject = subjectData.choices?.[0]?.message?.content?.trim() || "Quick hello";

    // Generate body
    const bodyResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Generate a short, casual, natural-sounding business email body. 2-4 sentences, friendly tone. Never mention products, marketing, sales, or promotions. Write as if catching up with a colleague. Return only the email body text, nothing else." },
          { role: "user", content: "Generate a unique warmup email body." },
        ],
      }),
    });

    if (!bodyResp.ok) {
      const errText = await bodyResp.text();
      console.error("AI body error:", bodyResp.status, errText);
      throw new Error("Failed to generate body");
    }

    const bodyData = await bodyResp.json();
    const body = bodyData.choices?.[0]?.message?.content?.trim() || "Hey! Just checking in. Hope all is well!";

    return new Response(JSON.stringify({ subject, body }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("generate-warmup-content error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

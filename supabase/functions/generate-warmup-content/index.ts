import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      persona = "professional",
      thread_context = null,
      previous_message_summary = null,
      is_reply = false,
      account_id = null,
      last_reply_length = "medium",
    } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Determine target length — never same as last
    const lengths = ["short", "medium", "long"];
    const availableLengths = lengths.filter(l => l !== last_reply_length);
    const targetLength = availableLengths[Math.floor(Math.random() * availableLengths.length)];

    const lengthInstruction = {
      short: "Write exactly 2-3 sentences. Keep it brief.",
      medium: "Write 4-6 sentences. A comfortable paragraph.",
      long: "Write 2 short paragraphs, 7-10 sentences total.",
    }[targetLength];

    const personaContext = {
      "Startup Founder": "You're a startup founder discussing business, growth, and industry trends.",
      "Agency": "You're an agency owner discussing clients, projects, and creative work.",
      "SaaS Sales": "You're a SaaS sales professional discussing software, meetings, and industry updates.",
      "Recruiter": "You're a recruiter discussing hiring, talent, and career topics.",
      "professional": "You're a business professional having natural workplace conversations.",
    }[persona] || "You're a business professional having natural workplace conversations.";

    let subjectPrompt: string;
    let bodyPrompt: string;

    if (is_reply && previous_message_summary) {
      subjectPrompt = "Do not generate a subject line. Return only the text: REPLY";
      bodyPrompt = `Generate a natural email reply. ${personaContext}

The previous message was about: "${previous_message_summary}"

Rules:
- Reference the previous message naturally (don't just say "thanks for your email")
- ${lengthInstruction}
- Plain text only. No HTML, no links, no images.
- No promotional language, no CTAs, no unsubscribe links.
- Sound like a real human replying to a colleague.
- Vary your opening — don't always start with "Hey" or "Hi".
- Include a natural closing line.

Return ONLY the reply body text, nothing else.`;
    } else {
      subjectPrompt = `Generate a unique, casual email subject line (4-7 words). ${personaContext} Natural, human-sounding. Never mention products, marketing, or sales. Return only the subject line.`;
      bodyPrompt = `Generate a unique casual business email. ${personaContext}

Rules:
- ${lengthInstruction}
- Plain text only. No HTML, no links, no images.
- No promotional language, no CTAs, no unsubscribe links.
- Must read like a natural business conversation.
- Vary your opening line — don't always start the same way.
- Include a natural sign-off.

${thread_context ? `Context for this conversation thread: ${thread_context}` : ""}

Return ONLY the email body text, nothing else.`;
    }

    // Try up to 3 times to generate non-duplicate content
    for (let attempt = 0; attempt < 3; attempt++) {
      const anthropicHeaders = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      };

      const [subjectResp, bodyResp] = await Promise.all([
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: anthropicHeaders,
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 256,
            system: subjectPrompt,
            messages: [
              { role: "user", content: `Generate unique content. Attempt ${attempt + 1}. Timestamp: ${Date.now()}` },
            ],
          }),
        }),
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: anthropicHeaders,
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            system: bodyPrompt,
            messages: [
              { role: "user", content: `Generate unique content. Attempt ${attempt + 1}. Timestamp: ${Date.now()}` },
            ],
          }),
        }),
      ]);

      if (!subjectResp.ok || !bodyResp.ok) {
        console.error("AI generation failed, attempt", attempt + 1);
        if (attempt === 2) throw new Error("Failed to generate content after 3 attempts");
        continue;
      }

      const subjectData = await subjectResp.json();
      const bodyData = await bodyResp.json();

      const subject = is_reply ? "REPLY" : (subjectData.content?.[0]?.text?.trim() || "Quick hello");
      const generatedBody = bodyData.content?.[0]?.text?.trim() || "Hey! Just checking in. Hope all is well!";

      // Check for duplicates if account_id provided
      if (account_id) {
        const subjectHash = await hashText(subject);
        const bodyHash = await hashText(generatedBody);

        const { data: existing } = await supabaseAdmin
          .from("warmup_content_log")
          .select("id")
          .eq("account_id", account_id)
          .eq("subject_hash", subjectHash)
          .eq("body_hash", bodyHash)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`Duplicate content detected for account ${account_id}, attempt ${attempt + 1}`);
          if (attempt === 2) {
            // Last attempt — use it anyway but log warning
            console.warn("Using duplicate content after 3 attempts");
          } else {
            continue;
          }
        }

        // Log the content hash
        await supabaseAdmin.from("warmup_content_log").insert({
          account_id,
          subject_hash: subjectHash,
          body_hash: bodyHash,
        });

        // Update last_reply_length on the account
        await supabaseAdmin
          .from("email_accounts")
          .update({ last_reply_length: targetLength })
          .eq("id", account_id);
      }

      return new Response(JSON.stringify({ subject, body: generatedBody, length: targetLength }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback
    return new Response(JSON.stringify({ subject: "Quick hello", body: "Hey! Just checking in. Hope all is well!", length: "short" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("generate-warmup-content error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

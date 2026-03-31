import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("Rate limit exceeded. Please try again later.");
    if (status === 402) throw new Error("Payment required. Please add credits.");
    const t = await response.text();
    console.error("Anthropic API error:", status, t);
    throw new Error("AI API error");
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, ...params } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "copy") {
      const { product, audience, goal, tone, length, pain_point, customer_profile } = params;
      systemPrompt = `You are an expert cold email copywriter. Generate 3 variations of a cold email, each with a different angle:
- Variation A: Pain-led (lead with the problem the prospect faces)
- Variation B: Outcome-led (lead with the result/benefit they'll get)
- Variation C: Curiosity-led (lead with an intriguing question or surprising stat)

For each variation, return a JSON object with these fields:
- subject: the subject line
- body: the email body
- angle: "pain" | "outcome" | "curiosity"
- spam_warnings: array of any spam trigger words found in the email (words like "free", "guarantee", "limited time", "click here", etc.)
- tone_score: number 1-10 where 1=very formal, 10=very casual

Return ONLY a valid JSON array of 3 objects. No other text.`;
      
      const profileStr = customer_profile ? `Customer profile: ${customer_profile}. ` : "";
      const painStr = pain_point ? `Pain point: ${pain_point}. ` : "";
      userPrompt = `Product: ${product}. Target audience: ${audience}. ${profileStr}${painStr}Goal: ${goal}. Tone: ${tone}. Length: ${length}.`;
    
    } else if (type === "regenerate-variation") {
      const { product, audience, goal, tone, length, angle, pain_point } = params;
      systemPrompt = `You are an expert cold email copywriter. Regenerate a single cold email variation with the "${angle}" angle.
Return a JSON object with: subject, body, angle, spam_warnings (array), tone_score (1-10). Return ONLY valid JSON.`;
      const painStr = pain_point ? `Pain point: ${pain_point}. ` : "";
      userPrompt = `Product: ${product}. Target: ${audience}. ${painStr}Goal: ${goal}. Tone: ${tone}. Length: ${length}. Angle: ${angle}.`;

    } else if (type === "follow-up") {
      const { originalSubject, originalBody, tone } = params;
      systemPrompt = "You are an expert cold email copywriter. Generate a follow-up email assuming no reply to the original.";
      userPrompt = `Original subject: ${originalSubject}. Original body: ${originalBody}. Tone: ${tone}. Return a JSON object with 'subject' and 'body' fields. Return only JSON, no other text.`;
    
    } else if (type === "subject-rewrite") {
      const { subject } = params;
      systemPrompt = "You are an email deliverability expert.";
      userPrompt = `Rewrite this subject line 3 ways to improve deliverability and open rate. Original: '${subject}'. Return only a JSON array of 3 strings.`;
    
    } else if (type === "analyze-subject") {
      const { subjects } = params;
      systemPrompt = `You are an email deliverability and open-rate expert. Analyze subject lines for cold email campaigns.

For each subject line, return a JSON object with:
- subject: the original subject line
- spam_score: 0-100 (lower = safer, based on spam trigger words, ALL CAPS, excessive punctuation, etc.)
- spam_words: array of specific words/phrases that triggered the spam score with brief explanations
- predicted_open_rate: a range string like "18-24%"
- open_rate_reasoning: brief explanation of why (length, personalization, emotional triggers, etc.)
- preview_text_suggestion: optimal preheader/preview text to pair with this subject
- improved_versions: array of 3 objects, each with "subject" and "explanation" of what was changed and why
- mobile_preview: the subject truncated at 40 characters with "..." if needed

If multiple subjects are provided, also include a "ranking" array at the top level that ranks them from best to worst with brief reasoning, and an "ab_recommendation" object with "subject_a" and "subject_b" (the two best to A/B test) and "reasoning".

Return ONLY valid JSON. If single subject, return a single object. If multiple, return { "analyses": [...], "ranking": [...], "ab_recommendation": {...} }.`;
      userPrompt = Array.isArray(subjects) 
        ? `Analyze these subject lines:\n${subjects.map((s: string, i: number) => `${i+1}. "${s}"`).join('\n')}`
        : `Analyze this subject line: "${subjects}"`;
    
    } else if (type === "analyze-send-time") {
      const { timezone, industry, email_type, historical_data } = params;
      systemPrompt = `You are an email send-time optimization expert. Analyze the best times to send emails based on industry data and recipient behavior patterns.

Return a JSON object with:
- best_day: { day: string, reasoning: string }
- best_time_window: { start: string, end: string, reasoning: string }
- avoid_times: array of { time: string, reasoning: string }
- recommended_cadence: array of { step: number, delay_days: number, reasoning: string }
- heatmap: a 7x24 grid as an array of 7 arrays (Sun-Sat), each containing 24 numbers (0-10) representing engagement score for each hour
- personal_insights: string (only if historical data is provided)

Return ONLY valid JSON.`;
      const histStr = historical_data ? `\nHistorical campaign data: ${JSON.stringify(historical_data)}` : "";
      userPrompt = `Target timezone: ${timezone}. Industry: ${industry}. Email type: ${email_type}.${histStr}`;

    } else if (type === "generate-sequence") {
      const { goal, product, audience, tone } = params;
      systemPrompt = `You are an expert cold email sequence designer. Generate a 5-step email sequence optimized for the given goal.

Each step should have:
- step_number: 1-5
- subject: subject line
- body: email body (use {{name}} and {{company}} for personalization)
- delay_days: days to wait after previous step (0 for step 1)
- condition_type: one of "always" (for step 1), "no_open", "open_no_reply", "link_click"
- reasoning: brief explanation of why this step and condition

Return ONLY a valid JSON array of 5 step objects.`;
      userPrompt = `Goal: ${goal}. Product: ${product || 'not specified'}. Audience: ${audience || 'not specified'}. Tone: ${tone || 'professional'}.`;

    } else if (type === "spintax") {
      const { body } = params;
      systemPrompt = "You are an email variation expert.";
      userPrompt = `Take this email and rewrite it with spintax. Identify 5-8 phrases that could naturally vary across recipients. Return the full email with spintax syntax {option1|option2|option3} applied. Email: '${body}'. Return only the rewritten email text, no explanation.`;
    
    } else if (type === "spintax-auto") {
      const { body } = params;
      systemPrompt = `You are an email spintax expert. Analyze the email and identify every sentence/phrase that can be varied without changing meaning. For each, generate 3-5 natural alternatives.

Return a JSON object with:
- spintax_email: the full email with {option1|option2|option3} syntax applied
- variation_count: total number of unique email combinations
- variations_applied: array of { original: string, alternatives: string[] } showing what was varied

Return ONLY valid JSON.`;
      userPrompt = `Create spintax for this email:\n\n${body}`;

    } else if (type === "spintax-suggest") {
      const { phrase, context } = params;
      systemPrompt = "You are an email variation expert. Suggest 4 natural alternative phrasings for the given phrase that maintain the same meaning and tone.";
      userPrompt = `Phrase: "${phrase}"\nContext: "${context || ''}"\n\nReturn ONLY a JSON array of 4 alternative strings.`;

    } else if (type === "spintax-check") {
      const { spintax_text } = params;
      systemPrompt = `You are an email quality checker. Review all spintax variations in the email for naturalness, grammar, and tonal consistency.

Return a JSON object with:
- issues: array of { variation: string, problem: string, suggestion: string }
- overall_quality: "good" | "needs_review" | "poor"
- total_variations_checked: number

Return ONLY valid JSON.`;
      userPrompt = `Review this spintax email for quality:\n\n${spintax_text}`;

    } else if (type === "run-full-audit") {
      const { domain, dns_data, blacklist_data, campaigns_data, engagement_data } = params;
      systemPrompt = `You are a deliverability audit expert. Analyze the provided data and generate a comprehensive deliverability report.

Score each layer 0-100:
1. DNS Health (SPF, DKIM, DMARC, MX)
2. Blacklist Status
3. Sending Infrastructure
4. Content Risk (analyze recent campaigns for spam words, link density, image-to-text ratio)
5. Engagement Health (open rate, reply rate, bounce rate vs benchmarks)

Return a JSON object with:
- dns_score, blacklist_score, infrastructure_score, content_score, engagement_score: each 0-100
- total_score: weighted average 0-100
- grade: "A" | "B" | "C" | "D" | "F"
- layers: array of 5 objects with { name, score, checks: [{ name, passed, detail, impact }] }
- priority_fixes: array of top 3 most impactful fixes, each with { problem, steps, estimated_impact }

Return ONLY valid JSON.`;
      userPrompt = `Domain: ${domain}\nDNS: ${JSON.stringify(dns_data || {})}\nBlacklist: ${JSON.stringify(blacklist_data || {})}\nRecent campaigns: ${JSON.stringify(campaigns_data || [])}\nEngagement: ${JSON.stringify(engagement_data || {})}`;

    } else {
      return new Response(JSON.stringify({ error: "Invalid type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content = await callClaude(systemPrompt, userPrompt, ANTHROPIC_API_KEY);

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

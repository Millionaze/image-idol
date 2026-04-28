// track-click: wraps URL clicks for tracking + emits email.clicked event.
// GET /functions/v1/track-click?id=<contact_id>&url=<base64url-encoded url>&campaign=<campaign_id>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const contactId = url.searchParams.get("id");
  const target = url.searchParams.get("url");
  const campaignId = url.searchParams.get("campaign") ?? null;
  const stepId = url.searchParams.get("step") ?? null;

  let decoded = "";
  try { decoded = target ? atob(target.replace(/-/g, "+").replace(/_/g, "/")) : ""; } catch { decoded = target ?? ""; }

  if (contactId && decoded) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, campaign_id, campaigns!inner(user_id)")
        .eq("id", contactId)
        .maybeSingle();
      if (contact) {
        await supabase.from("events").insert({
          user_id: (contact as any).campaigns.user_id,
          contact_id: contactId,
          event_type: "email.clicked",
          source: { campaign_id: campaignId ?? contact.campaign_id, sequence_step_id: stepId, link_url: decoded },
          payload: { url: decoded },
        });
      }
    } catch (e) {
      console.error("track-click error:", e);
    }
  }

  return new Response(null, {
    status: 302,
    headers: { Location: decoded || "https://www.google.com" },
  });
});

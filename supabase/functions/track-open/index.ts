import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const TRACKING_PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const contactId = url.searchParams.get("id");

  if (contactId) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: contact } = await supabase
        .from("contacts")
        .select("id, campaign_id, opened_at")
        .eq("id", contactId)
        .single();

      if (contact && !contact.opened_at) {
        await supabase.from("contacts").update({
          status: "opened",
          opened_at: new Date().toISOString(),
        }).eq("id", contactId);

        const { data: campaign } = await supabase
          .from("campaigns")
          .select("open_count")
          .eq("id", contact.campaign_id)
          .single();

        if (campaign) {
          await supabase.from("campaigns").update({
            open_count: campaign.open_count + 1,
          }).eq("id", contact.campaign_id);
        }
      }
    } catch (e) {
      console.error("Track open error:", e);
    }
  }

  return new Response(TRACKING_PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
});

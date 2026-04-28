// event-emit: single insertion point for the events bus.
// Called by other edge functions (server-to-server with service role key)
// or by the frontend (with user JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { user_id, contact_id, event_type, source, payload } = body ?? {};
    if (!event_type || typeof event_type !== "string") {
      return new Response(JSON.stringify({ error: "event_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let resolvedUserId = user_id as string | undefined;

    // If no user_id provided, try to derive from auth header
    if (!resolvedUserId) {
      const auth = req.headers.get("Authorization");
      if (auth?.startsWith("Bearer ")) {
        const token = auth.slice(7);
        const { data } = await supabase.auth.getUser(token);
        resolvedUserId = data?.user?.id;
      }
    }

    if (!resolvedUserId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        user_id: resolvedUserId,
        contact_id: contact_id ?? null,
        event_type,
        source: source ?? {},
        payload: payload ?? {},
      })
      .select("id")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("event-emit error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

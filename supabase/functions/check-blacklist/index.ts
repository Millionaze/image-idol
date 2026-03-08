import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DNSBL_SERVERS = [
  "zen.spamhaus.org",
  "bl.spamcop.net",
  "b.barracudacentral.org",
  "dnsbl.sorbs.net",
  "psbl.surriel.com",
];

async function resolveIP(domain: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    const data = await resp.json();
    if (data.Answer && data.Answer.length > 0) {
      return data.Answer[0].data;
    }
    return null;
  } catch {
    return null;
  }
}

function reverseIP(ip: string): string {
  return ip.split(".").reverse().join(".");
}

async function checkDNSBL(reversedIP: string, dnsbl: string): Promise<boolean> {
  try {
    const query = `${reversedIP}.${dnsbl}`;
    const resp = await fetch(`https://dns.google/resolve?name=${query}&type=A`);
    const data = await resp.json();
    // If there's an answer, the IP is listed
    return !!(data.Answer && data.Answer.length > 0);
  } catch {
    return false;
  }
}

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

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { domain, account_id } = await req.json();
    if (!domain || !account_id) {
      return new Response(JSON.stringify({ error: "domain and account_id required" }), { status: 400, headers: corsHeaders });
    }

    // Resolve domain to IP
    const ip = await resolveIP(domain);
    if (!ip) {
      return new Response(JSON.stringify({
        is_clean: true,
        listed_on: [],
        message: "Could not resolve domain IP — skipping blacklist check",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reversedIP = reverseIP(ip);
    const listed_on: string[] = [];

    // Check all DNSBLs in parallel
    const results = await Promise.all(
      DNSBL_SERVERS.map(async (dnsbl) => ({
        dnsbl,
        listed: await checkDNSBL(reversedIP, dnsbl),
      }))
    );

    for (const r of results) {
      if (r.listed) listed_on.push(r.dnsbl);
    }

    const is_clean = listed_on.length === 0;

    // Store result
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabaseAdmin.from("blacklist_checks").insert({
      account_id,
      is_clean,
      listed_on,
    });

    return new Response(JSON.stringify({ is_clean, listed_on, ip }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

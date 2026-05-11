const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function queryDns(name: string, type: string): Promise<any> {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
  return res.json();
}

function checkSpf(answers: any[]): { found: boolean; record: string | null } {
  if (!answers) return { found: false, record: null };
  for (const a of answers) {
    if (a.data && a.data.toLowerCase().includes("v=spf1")) {
      return { found: true, record: a.data };
    }
  }
  return { found: false, record: null };
}

function checkDmarc(answers: any[]): { found: boolean; record: string | null } {
  if (!answers) return { found: false, record: null };
  for (const a of answers) {
    if (a.data && a.data.toLowerCase().includes("v=dmarc1")) {
      return { found: true, record: a.data };
    }
  }
  return { found: false, record: null };
}

// Common DKIM selectors across major providers
const DEFAULT_SELECTORS = [
  // Generic / common
  "default", "dkim", "dkim1", "dkim2", "mail", "email", "key1", "key2", "k1", "k2", "1", "2",
  // Microsoft 365 / Exchange
  "selector1", "selector2",
  // GoDaddy / SecureServer / Namecheap PrivateEmail
  "s1", "s2", "s1024", "s2048",
  // Google Workspace
  "google",
  // Proton
  "protonmail", "protonmail2", "protonmail3",
  // Zoho
  "zoho", "zmail",
  // MXroute
  "mxvault",
  // Fastmail
  "fm1", "fm2", "fm3",
  // ESPs
  "mandrill", "mailjet", "smtpapi", "sendgrid", "scph0820", "scph1020",
  "pm", "pic", "litmus", "mta1", "mta2", "everlytic",
];

async function checkSelector(selector: string, domain: string) {
  try {
    const res = await queryDns(`${selector}._domainkey.${domain}`, "TXT");
    if (res.Answer) {
      for (const a of res.Answer) {
        if (a.data && (a.data.includes("v=DKIM1") || a.data.includes("p="))) {
          return { found: true, record: a.data as string };
        }
      }
    }
  } catch (_) { /* ignore */ }
  return { found: false, record: null as string | null };
}

async function checkDkim(
  domain: string,
  customSelector?: string | null,
): Promise<{ found: boolean; selector: string | null; record: string | null; tried: string[] }> {
  const tried: string[] = [];
  // Try user-provided selector first
  if (customSelector) {
    tried.push(customSelector);
    const r = await checkSelector(customSelector, domain);
    if (r.found) return { found: true, selector: customSelector, record: r.record, tried };
  }
  for (const sel of DEFAULT_SELECTORS) {
    if (sel === customSelector) continue;
    tried.push(sel);
    const r = await checkSelector(sel, domain);
    if (r.found) return { found: true, selector: sel, record: r.record, tried };
  }
  return { found: false, selector: null, record: null, tried };
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domain, selector } = await req.json();
    if (!domain) {
      return new Response(JSON.stringify({ error: "domain required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [spfRes, dmarcRes, dkimRes] = await Promise.all([
      queryDns(domain, "TXT"),
      queryDns(`_dmarc.${domain}`, "TXT"),
      checkDkim(domain, selector ?? null),
    ]);

    const spf = checkSpf(spfRes.Answer);
    const dmarc = checkDmarc(dmarcRes.Answer);

    const result = {
      spf: spf.found,
      spf_record: spf.record,
      dkim: dkimRes.found,
      dkim_selector: dkimRes.selector,
      dkim_record: dkimRes.record,
      dkim_tried_selectors: dkimRes.tried,
      dmarc: dmarc.found,
      dmarc_record: dmarc.record,
      score: (spf.found ? 1 : 0) + (dkimRes.found ? 1 : 0) + (dmarc.found ? 1 : 0),
    };

    // Persist to dns_health_log for caching across reloads
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("dns_health_log").insert({
        domain,
        spf_status: spf.found,
        dkim_status: dkimRes.found,
        dmarc_status: dmarc.found,
      });
    } catch (logErr) {
      console.error("Failed to log DNS check:", logErr);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

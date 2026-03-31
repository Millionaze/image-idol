import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function queryDns(name: string, type: string): Promise<any> {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`);
  return res.json();
}

function checkRecord(answers: any[], marker: string): boolean {
  if (!answers) return false;
  return answers.some((a: any) => a.data?.toLowerCase().includes(marker));
}

async function checkDkim(domain: string): Promise<boolean> {
  const selectors = ["google", "default", "mail", "selector1", "selector2", "k1"];
  for (const sel of selectors) {
    try {
      const res = await queryDns(`${sel}._domainkey.${domain}`, "TXT");
      if (res.Answer?.some((a: any) => a.data?.includes("v=DKIM1") || a.data?.includes("p="))) {
        return true;
      }
    } catch (_) { /* continue */ }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get distinct domains from active warmup accounts
    const { data: accounts } = await supabaseAdmin
      .from("email_accounts")
      .select("id, email, warmup_status")
      .eq("warmup_enabled", true);

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No warmup accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const domainMap = new Map<string, string[]>();
    for (const acc of accounts) {
      const domain = acc.email.split("@")[1];
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain)!.push(acc.id);
    }

    let checked = 0;
    let issues = 0;
    let restored = 0;

    for (const [domain, accountIds] of domainMap) {
      try {
        const [spfRes, dmarcRes, dkimResult] = await Promise.all([
          queryDns(domain, "TXT"),
          queryDns(`_dmarc.${domain}`, "TXT"),
          checkDkim(domain),
        ]);

        const spfOk = checkRecord(spfRes.Answer, "v=spf1");
        const dmarcOk = checkRecord(dmarcRes.Answer, "v=dmarc1");
        const dkimOk = dkimResult;

        // Get last known state
        const { data: lastCheck } = await supabaseAdmin
          .from("dns_health_log")
          .select("*")
          .eq("domain", domain)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const currentState = { spf: spfOk, dkim: dkimOk, dmarc: dmarcOk };
        const previousState = lastCheck
          ? { spf: lastCheck.spf_status, dkim: lastCheck.dkim_status, dmarc: lastCheck.dmarc_status }
          : null;

        const hasChanged = previousState
          ? (currentState.spf !== previousState.spf || currentState.dkim !== previousState.dkim || currentState.dmarc !== previousState.dmarc)
          : true;

        // Log the check
        await supabaseAdmin.from("dns_health_log").insert({
          domain,
          spf_status: spfOk,
          dkim_status: dkimOk,
          dmarc_status: dmarcOk,
          changed_from: hasChanged && previousState ? previousState : null,
          changed_to: hasChanged ? currentState : null,
        });

        checked++;

        // React to DNS failures
        const allValid = spfOk && dkimOk && dmarcOk;

        if (!allValid && hasChanged) {
          // DNS broke — pause warmup for all accounts on this domain
          for (const accId of accountIds) {
            await supabaseAdmin.from("email_accounts")
              .update({ warmup_status: "dns_error" })
              .eq("id", accId);
          }
          issues++;

          const brokenRecords = [];
          if (!spfOk) brokenRecords.push("SPF");
          if (!dkimOk) brokenRecords.push("DKIM");
          if (!dmarcOk) brokenRecords.push("DMARC");
          console.warn(`DNS issue on ${domain}: ${brokenRecords.join(", ")} missing/invalid. Warmup paused for ${accountIds.length} accounts.`);
        } else if (allValid && previousState && (!previousState.spf || !previousState.dkim || !previousState.dmarc)) {
          // DNS restored — resume warmup
          for (const accId of accountIds) {
            const { data: acc } = await supabaseAdmin
              .from("email_accounts")
              .select("warmup_status")
              .eq("id", accId)
              .single();
            if (acc?.warmup_status === "dns_error") {
              await supabaseAdmin.from("email_accounts")
                .update({ warmup_status: "active" })
                .eq("id", accId);
              restored++;
            }
          }
          console.log(`DNS restored for ${domain}. Warmup resumed for ${accountIds.length} accounts.`);
        }
      } catch (dnsErr: any) {
        console.error(`DNS check failed for ${domain}:`, dnsErr.message);
      }
    }

    return new Response(JSON.stringify({
      message: `DNS monitor: ${checked} domains checked, ${issues} issues found, ${restored} restored`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("warmup-dns-monitor error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

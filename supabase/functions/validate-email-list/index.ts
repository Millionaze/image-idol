import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const DISPOSABLE_DOMAINS = [
  "mailinator.com","tempmail.com","guerrillamail.com","throwaway.email","yopmail.com",
  "sharklasers.com","guerrillamailblock.com","grr.la","guerrillamail.info","guerrillamail.biz",
  "guerrillamail.de","guerrillamail.net","guerrillamail.org","spam4.me","trashmail.com",
  "trashmail.me","trashmail.net","trashmail.org","bugmenot.com","maildrop.cc",
  "dispostable.com","mailnesia.com","tempail.com","tempr.email","temp-mail.org",
  "fakeinbox.com","mailcatch.com","mailforspam.com","safetymail.info","getnada.com",
  "mohmal.com","burnermail.io","10minutemail.com","emailondeck.com","mintemail.com",
  "harakirimail.com","jetable.org","mailexpire.com","throwam.com","tempmailaddress.com",
  "tmpmail.net","tmpmail.org","bupmail.com","discard.email","discardmail.com",
  "discardmail.de","emailigo.de","emailmiser.com","emailtemporario.com.br",
  "ephemail.net","filzmail.com","fixmail.tk","flurre.com","freecat.net",
  "getairmail.com","getonemail.com","getonemail.net","girlsundertheinfluence.com",
  "givmail.com","gustr.com","haltospam.com","herp.in","hidemail.de",
  "hidzz.com","hotpop.com","ichimail.com","imails.info","incognitomail.com",
  "inpwa.com","instant-mail.de","ipoo.org","irish2me.com","iwi.net",
  "jetable.com","jetable.fr.nf","jetable.net","jetable.org","jnxjn.com",
  "jourrapide.com","kasmail.com","koszmail.pl","kurzepost.de","lawlita.com",
  "letthemeatspam.com","lhsdv.com","lifebyfood.com","link2mail.net",
  "litedrop.com","lookugly.com","lopl.co.cc","lortemail.dk","lr78.com",
  "maileater.com","mailexpire.com","mailfreeonline.com","mailguard.me",
  "mailin8r.com","mailinator.net","mailinator2.com","mailincubator.com",
  "mailismagic.com","mailmate.com","mailme.lv","mailmetrash.com",
  "mailmoat.com","mailms.com","mailnator.com","mailnull.com",
  "mailorg.org","mailpick.biz","mailrock.biz","mailscrap.com",
  "mailshell.com","mailsiphon.com","mailslite.com","mailtemp.info",
  "mailtome.de","mailtothis.com","mailtrash.net","mailtv.net",
  "mailzilla.com","makemetheking.com","manifestgenerator.com",
  "messagebeamer.de","mezimages.net","mfsa.ru","mhwolf.net",
  "ministry-of-silly-walks.de","mmmmail.com","moakt.com",
  "moncourrier.fr.nf","monemail.fr.nf","monmail.fr.nf","mt2015.com",
  "mx0.wwwnew.eu","myalias.pw","mycard.net.ua","mycleaninbox.net",
  "myemailboxy.com","mymail-in.net","mypacks.net","mypartyclip.de",
  "myphantom.com","mysamp.de","myspaceinc.com","myspaceinc.net",
  "myspaceinc.org","myspacepimpedup.com","mytemp.email","mytempmail.com",
  "neomailbox.com","nepwk.com","nervmich.net","nervtansen.de",
  "netmails.com","netmails.net","neverbox.com","no-spam.ws",
  "nobulk.com","noclickemail.com","nogmailspam.info","nomail.pw",
  "nomail.xl.cx","nomail2me.com","nomorespamemails.com","nonspam.eu",
  "nonspammer.de","noref.in","nospam.ze.tc","nospam4.us",
  "nospamfor.us","nospammail.net","nospamthanks.info","nothingtoseehere.ca",
  "nowmymail.com","nurfuerspam.de","nwldx.com","objectmail.com",
];

const ROLE_PREFIXES = [
  "info@","admin@","support@","noreply@","no-reply@","sales@","postmaster@",
  "abuse@","webmaster@","contact@","help@","billing@","office@","marketing@",
  "hr@","jobs@","press@","media@","team@","hello@","enquiries@","feedback@",
];

function checkSyntax(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

function checkDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.includes(domain.toLowerCase());
}

function checkRoleBased(email: string): boolean {
  const lower = email.toLowerCase();
  return ROLE_PREFIXES.some(p => lower.startsWith(p));
}

async function checkMX(domain: string): Promise<{ hasMX: boolean; isCatchAll: boolean }> {
  try {
    const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`);
    const data = await resp.json();
    const hasMX = data.Answer && data.Answer.length > 0;
    return { hasMX: !!hasMX, isCatchAll: false };
  } catch {
    return { hasMX: false, isCatchAll: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { job_id, emails } = await req.json();

    if (!job_id || !emails || !Array.isArray(emails)) {
      return new Response(JSON.stringify({ error: "job_id and emails array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Process in background-ish manner but still return results
    const results: Array<{ email: string; status: string; reason: string }> = [];
    let validCount = 0, riskyCount = 0, invalidCount = 0, disposableCount = 0;

    // Cache MX lookups per domain
    const mxCache: Record<string, { hasMX: boolean; isCatchAll: boolean }> = {};

    for (const email of emails) {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) continue;

      // Layer 1: Syntax
      if (!checkSyntax(trimmed)) {
        results.push({ email: trimmed, status: "invalid", reason: "Invalid email format" });
        invalidCount++;
        continue;
      }

      const domain = trimmed.split("@")[1];

      // Layer 2: MX lookup
      if (!mxCache[domain]) {
        mxCache[domain] = await checkMX(domain);
      }
      if (!mxCache[domain].hasMX) {
        results.push({ email: trimmed, status: "invalid", reason: "Domain has no mail server (MX record)" });
        invalidCount++;
        continue;
      }

      // Layer 3: Disposable
      if (checkDisposable(domain)) {
        results.push({ email: trimmed, status: "disposable", reason: "Disposable/temporary email domain" });
        disposableCount++;
        continue;
      }

      // Layer 4: Role-based
      if (checkRoleBased(trimmed)) {
        results.push({ email: trimmed, status: "risky", reason: "Role-based address (hurts deliverability)" });
        riskyCount++;
        continue;
      }

      // Passed all checks
      results.push({ email: trimmed, status: "valid", reason: "All checks passed" });
      validCount++;
    }

    // Update job status using service role
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Insert results
    if (results.length > 0) {
      const resultRows = results.map(r => ({
        job_id,
        email: r.email,
        status: r.status,
        reason: r.reason,
      }));
      // Insert in batches of 100
      for (let i = 0; i < resultRows.length; i += 100) {
        await serviceClient.from("list_cleaning_results").insert(resultRows.slice(i, i + 100));
      }
    }

    // Update job counts
    await serviceClient.from("list_cleaning_jobs").update({
      status: "completed",
      total_emails: results.length,
      valid_count: validCount,
      risky_count: riskyCount,
      invalid_count: invalidCount,
      disposable_count: disposableCount,
    }).eq("id", job_id);

    return new Response(JSON.stringify({
      total: results.length,
      valid: validCount,
      risky: riskyCount,
      invalid: invalidCount,
      disposable: disposableCount,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("validate-email-list error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

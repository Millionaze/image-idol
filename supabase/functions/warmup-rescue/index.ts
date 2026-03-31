import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── IMAP helpers (raw TCP/TLS) ───────────────────────────────────────────

class ImapReader {
  private decoder = new TextDecoder();
  private buffer = "";
  private reader: ReadableStreamDefaultReader<Uint8Array>;

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.reader = reader;
  }

  async readLine(): Promise<string> {
    while (!this.buffer.includes("\r\n")) {
      const { value, done } = await this.reader.read();
      if (done) break;
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    const idx = this.buffer.indexOf("\r\n");
    if (idx === -1) {
      const line = this.buffer;
      this.buffer = "";
      return line;
    }
    const line = this.buffer.substring(0, idx);
    this.buffer = this.buffer.substring(idx + 2);
    return line;
  }

  async readUntilTagged(tag: string): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      if (line.startsWith(tag + " ")) break;
    }
    return lines;
  }
}

async function imapCommand(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ImapReader,
  tag: string,
  command: string
): Promise<string[]> {
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`${tag} ${command}\r\n`));
  return await reader.readUntilTagged(tag);
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

    const { data: accounts } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("warmup_enabled", true)
      .not("imap_host", "is", null);

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No IMAP-enabled warmup accounts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get warmup partner emails for identification
    const { data: warmupLogs } = await supabaseAdmin
      .from("warmup_logs")
      .select("partner_email, account_id")
      .eq("type", "sent")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const warmupEmailsSet = new Set<string>();
    const senderToAccount = new Map<string, string>();
    if (warmupLogs) {
      for (const log of warmupLogs) {
        if (log.partner_email) warmupEmailsSet.add(log.partner_email.toLowerCase());
        if (log.partner_email && log.account_id) {
          senderToAccount.set(log.partner_email.toLowerCase(), log.account_id);
        }
      }
    }

    // Also add all warmup account emails
    for (const acc of accounts) {
      warmupEmailsSet.add(acc.email.toLowerCase());
    }

    let totalRescued = 0;
    let totalFailed = 0;

    for (const account of accounts) {
      if (!account.imap_host) continue;

      let conn: Deno.TlsConn | null = null;
      try {
        conn = await Deno.connectTls({
          hostname: account.imap_host,
          port: account.imap_port || 993,
        });

        const reader = new ImapReader(conn.readable.getReader());
        const writer = conn.writable.getWriter();

        // Read greeting
        await reader.readLine();

        // Login
        const loginResp = await imapCommand(writer, reader, "A1", `LOGIN "${account.username}" "${account.password}"`);
        const loginOk = loginResp.some(l => l.startsWith("A1 OK"));
        if (!loginOk) {
          console.error(`IMAP login failed for ${account.email}`);
          continue;
        }

        // Try spam folders
        const spamFolders = ["[Gmail]/Spam", "Junk", "Spam", "Junk E-mail", "INBOX.Junk", "INBOX.spam"];
        let selectedFolder = false;

        for (const folder of spamFolders) {
          const selectResp = await imapCommand(writer, reader, "A2", `SELECT "${folder}"`);
          if (selectResp.some(l => l.startsWith("A2 OK"))) {
            selectedFolder = true;
            break;
          }
        }

        if (!selectedFolder) {
          console.log(`No spam folder found for ${account.email}`);
          await imapCommand(writer, reader, "A9", "LOGOUT");
          continue;
        }

        // Search for unseen messages from last 7 days
        const searchResp = await imapCommand(writer, reader, "A3", "SEARCH SINCE " + formatImapDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
        const searchLine = searchResp.find(l => l.startsWith("* SEARCH"));
        if (!searchLine || searchLine.trim() === "* SEARCH") {
          await imapCommand(writer, reader, "A9", "LOGOUT");
          continue;
        }

        const uids = searchLine.replace("* SEARCH ", "").trim().split(" ").filter(Boolean);

        for (const uid of uids.slice(0, 50)) { // Process max 50 per run
          // Fetch headers to check if it's from a warmup partner
          const fetchResp = await imapCommand(writer, reader, "A4",
            `FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (FROM)])`);
          const fromLine = fetchResp.find(l => l.toLowerCase().startsWith("from:"));
          if (!fromLine) continue;

          const emailMatch = fromLine.match(/<([^>]+)>/) || fromLine.match(/:\s*(\S+@\S+)/);
          const fromEmail = emailMatch ? emailMatch[1].toLowerCase() : "";

          if (!warmupEmailsSet.has(fromEmail)) continue;

          // This is a warmup email in spam — rescue it!
          const landedAt = new Date().toISOString();

          try {
            // Copy to INBOX
            await imapCommand(writer, reader, "A5", `COPY ${uid} INBOX`);

            // Mark as seen and flagged (important/starred)
            await imapCommand(writer, reader, "A6", `STORE ${uid} +FLAGS (\\Seen \\Flagged)`);

            // Delete from spam
            await imapCommand(writer, reader, "A7", `STORE ${uid} +FLAGS (\\Deleted)`);

            // Log rescue
            const sendingAccountId = senderToAccount.get(fromEmail);
            await supabaseAdmin.from("warmup_rescues").insert({
              sending_account_id: sendingAccountId || account.id,
              receiving_account_id: account.id,
              message_id: uid,
              landed_in_spam_at: landedAt,
              rescued_at: new Date().toISOString(),
              rescue_success: true,
            });

            // Log as rescued_from_spam
            await supabaseAdmin.from("warmup_logs").insert({
              account_id: account.id,
              type: "rescued_from_spam",
              partner_email: fromEmail,
              subject: `Rescued from spam (UID: ${uid})`,
              status: "success",
            });

            totalRescued++;
          } catch (rescueErr: any) {
            console.error(`Rescue failed for UID ${uid}:`, rescueErr.message);

            await supabaseAdmin.from("warmup_rescues").insert({
              sending_account_id: senderToAccount.get(fromEmail) || account.id,
              receiving_account_id: account.id,
              message_id: uid,
              landed_in_spam_at: landedAt,
              rescue_success: false,
            });
            totalFailed++;
          }
        }

        // Expunge deleted messages
        await imapCommand(writer, reader, "A8", "EXPUNGE");
        await imapCommand(writer, reader, "A9", "LOGOUT");

      } catch (connErr: any) {
        console.error(`IMAP connection failed for ${account.email}:`, connErr.message);
      }
    }

    // Check rescue rates per sending account
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rescueStats } = await supabaseAdmin
      .from("warmup_rescues")
      .select("sending_account_id, rescue_success")
      .gte("created_at", sevenDaysAgo);

    if (rescueStats && rescueStats.length > 0) {
      const rateByAccount = new Map<string, { total: number; success: number }>();
      for (const r of rescueStats) {
        const stats = rateByAccount.get(r.sending_account_id) || { total: 0, success: 0 };
        stats.total++;
        if (r.rescue_success) stats.success++;
        rateByAccount.set(r.sending_account_id, stats);
      }

      for (const [accountId, stats] of rateByAccount) {
        const rate = (stats.success / stats.total) * 100;
        if (rate < 80) {
          console.warn(`Rescue rate for account ${accountId} is ${rate.toFixed(1)}% — flagged for review`);
          // Lower reputation score slightly
          await supabaseAdmin.rpc("", {}).catch(() => {}); // no-op placeholder
          const { data: account } = await supabaseAdmin
            .from("email_accounts")
            .select("reputation_score")
            .eq("id", accountId)
            .single();
          if (account) {
            await supabaseAdmin.from("email_accounts")
              .update({ reputation_score: Math.max(0, account.reputation_score - 2) })
              .eq("id", accountId);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      message: `Rescue complete: ${totalRescued} rescued, ${totalFailed} failed`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("warmup-rescue error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatImapDate(date: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

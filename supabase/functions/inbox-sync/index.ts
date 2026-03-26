import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Buffered IMAP reader — keeps leftover bytes between reads */
class ImapReader {
  private conn: Deno.TlsConn | Deno.Conn;
  private buffer = "";

  constructor(conn: Deno.TlsConn | Deno.Conn) {
    this.conn = conn;
  }

  setConn(conn: Deno.TlsConn | Deno.Conn) {
    this.conn = conn;
  }

  /** Read more data from the socket into the internal buffer */
  private async fillBuffer(timeoutMs: number): Promise<boolean> {
    const buf = new Uint8Array(65536);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(false); }
      }, timeoutMs);

      this.conn.read(buf).then((n) => {
        clearTimeout(timer);
        if (done) return; // timeout already fired
        done = true;
        if (n === null || n === 0) {
          resolve(false);
        } else {
          this.buffer += decoder.decode(buf.subarray(0, n));
          resolve(true);
        }
      }).catch(() => {
        clearTimeout(timer);
        if (!done) { done = true; resolve(false); }
      });
    });
  }

  /** Read lines until we see one starting with the given tag */
  async readUntilTag(tag: string, timeoutMs = 30000): Promise<string> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      // Check if we already have the tagged response in buffer
      const lines = this.buffer.split("\r\n");
      for (const line of lines) {
        if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
          // Find the position after this tagged line
          const idx = this.buffer.indexOf(line) + line.length;
          // Consume up to and including the \r\n after the tagged line
          const nextCrlf = this.buffer.indexOf("\r\n", idx);
          const result = this.buffer.substring(0, nextCrlf >= 0 ? nextCrlf + 2 : this.buffer.length);
          this.buffer = nextCrlf >= 0 ? this.buffer.substring(nextCrlf + 2) : "";
          return result;
        }
      }

      // Need more data
      const remaining = Math.max(500, deadline - Date.now());
      const got = await this.fillBuffer(remaining);
      if (!got && this.buffer.length > 0) {
        // No more data coming, return what we have
        break;
      }
      if (!got) break;
    }

    // Return whatever we have (caller will check for tag)
    const result = this.buffer;
    this.buffer = "";
    return result;
  }

  /** Read initial greeting (untagged, starts with "* OK") */
  async readGreeting(timeoutMs = 10000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.buffer.includes("\r\n")) {
        const idx = this.buffer.indexOf("\r\n");
        const line = this.buffer.substring(0, idx + 2);
        this.buffer = this.buffer.substring(idx + 2);
        return line;
      }
      const remaining = Math.max(500, deadline - Date.now());
      const got = await this.fillBuffer(remaining);
      if (!got) break;
    }
    const result = this.buffer;
    this.buffer = "";
    return result;
  }
}

function checkOk(response: string, tag: string): void {
  const lines = response.split("\r\n");
  for (const line of lines) {
    if (line.startsWith(`${tag} OK`)) return;
    if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
      throw new Error(`IMAP error: ${line}`);
    }
  }
  throw new Error(`No tagged response for ${tag}. Response (first 300 chars): ${response.substring(0, 300)}`);
}

async function sendCommand(reader: ImapReader, conn: Deno.TlsConn | Deno.Conn, tag: string, command: string): Promise<string> {
  await conn.write(encoder.encode(`${tag} ${command}\r\n`));
  return await reader.readUntilTag(tag, 30000);
}

function parseFrom(headerBlock: string): { name: string | null; email: string | null } {
  const fromMatch = headerBlock.match(/^From:\s*(.+)$/mi);
  if (!fromMatch) return { name: null, email: null };
  const raw = fromMatch[1].trim();
  const angleMatch = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
  if (angleMatch) {
    return { name: angleMatch[1].trim() || null, email: angleMatch[2].trim() };
  }
  return { name: null, email: raw };
}

function parseSubject(headerBlock: string): string | null {
  const m = headerBlock.match(/^Subject:\s*(.+)$/mi);
  return m ? m[1].trim() : null;
}

function parseDate(headerBlock: string): string | null {
  const m = headerBlock.match(/^Date:\s*(.+)$/mi);
  if (!m) return null;
  try {
    return new Date(m[1].trim()).toISOString();
  } catch {
    return new Date().toISOString();
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user.id;

    const { account_id } = await req.json();
    if (!account_id) {
      return new Response(JSON.stringify({ error: "account_id required" }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: account, error: accError } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("id", account_id)
      .eq("user_id", userId)
      .single();

    if (accError || !account) {
      return new Response(JSON.stringify({ error: "Account not found or access denied" }), { status: 404, headers: corsHeaders });
    }

    const imapHost = account.imap_host;
    const imapPort = account.imap_port || 993;
    const username = account.username || account.email;
    const password = account.password;
    const lastSyncedUid = (account as any).last_synced_uid || 0;

    if (!imapHost) {
      return new Response(JSON.stringify({ error: "IMAP host not configured for this account." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Connecting to IMAP ${imapHost}:${imapPort} for ${account.email}`);

    let conn: Deno.TlsConn | Deno.Conn;
    if (imapPort === 993) {
      conn = await Deno.connectTls({ hostname: imapHost, port: imapPort });
    } else {
      conn = await Deno.connect({ hostname: imapHost, port: imapPort });
    }

    const reader = new ImapReader(conn);

    try {
      // Read greeting
      const greeting = await reader.readGreeting(10000);
      console.log("Greeting:", greeting.trim());
      if (!greeting.includes("OK")) {
        throw new Error(`Server rejected connection: ${greeting.substring(0, 200)}`);
      }

      // STARTTLS for non-993 ports
      if (imapPort !== 993) {
        await conn.write(encoder.encode("T0 STARTTLS\r\n"));
        const starttlsResp = await reader.readUntilTag("T0", 10000);
        if (starttlsResp.includes("T0 OK")) {
          conn = await Deno.startTls(conn as Deno.Conn, { hostname: imapHost });
          reader.setConn(conn);
        }
      }

      let tagNum = 1;
      const nextTag = () => `A${tagNum++}`;

      // LOGIN
      const loginTag = nextTag();
      const escapedUser = username.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const escapedPass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const loginResp = await sendCommand(reader, conn, loginTag, `LOGIN "${escapedUser}" "${escapedPass}"`);
      console.log("LOGIN response tag line:", loginResp.split("\r\n").find(l => l.startsWith(loginTag)) || "(none)");
      checkOk(loginResp, loginTag);

      // SELECT INBOX
      const selectTag = nextTag();
      const selectResp = await sendCommand(reader, conn, selectTag, "SELECT INBOX");
      checkOk(selectResp, selectTag);

      const existsMatch = selectResp.match(/\*\s+(\d+)\s+EXISTS/i);
      const totalMessages = existsMatch ? parseInt(existsMatch[1]) : 0;
      console.log(`INBOX: ${totalMessages} messages, last synced UID: ${lastSyncedUid}`);

      if (totalMessages === 0) {
        try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}
        return new Response(JSON.stringify({ message: "Inbox is empty", synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // UID SEARCH
      const searchTag = nextTag();
      let searchCmd: string;
      if (lastSyncedUid > 0) {
        searchCmd = `UID SEARCH UID ${lastSyncedUid + 1}:*`;
      } else {
        const startSeq = Math.max(1, totalMessages - 49);
        searchCmd = `UID SEARCH ${startSeq}:*`;
      }
      const searchResp = await sendCommand(reader, conn, searchTag, searchCmd);
      checkOk(searchResp, searchTag);

      const searchLine = searchResp.split("\r\n").find(l => l.startsWith("* SEARCH"));
      const uids: number[] = [];
      if (searchLine) {
        const parts = searchLine.replace("* SEARCH", "").trim().split(/\s+/);
        for (const p of parts) {
          const uid = parseInt(p);
          if (!isNaN(uid) && uid > lastSyncedUid) uids.push(uid);
        }
      }

      console.log(`Found ${uids.length} new UIDs`);

      if (uids.length === 0) {
        try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}
        return new Response(JSON.stringify({ message: "No new messages", synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fetchUids = uids.slice(0, 50);
      let maxUid = lastSyncedUid;

      const messages: Array<{
        account_id: string;
        from_email: string | null;
        from_name: string | null;
        subject: string | null;
        body: string | null;
        received_at: string;
        message_uid: string;
      }> = [];

      for (let i = 0; i < fetchUids.length; i += 10) {
        const batch = fetchUids.slice(i, i + 10);
        const uidList = batch.join(",");
        const fetchTag = nextTag();
        const fetchResp = await sendCommand(
          reader, conn, fetchTag,
          `UID FETCH ${uidList} (UID BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`
        );

        const fetchBlocks = fetchResp.split(/\*\s+\d+\s+FETCH\s+/i).filter(b => b.trim());

        for (const block of fetchBlocks) {
          const uidMatch = block.match(/UID\s+(\d+)/i);
          if (!uidMatch) continue;
          const uid = parseInt(uidMatch[1]);
          if (uid > maxUid) maxUid = uid;

          const headerMatch = block.match(/BODY\[HEADER\.FIELDS\s+\([^)]+\)\]\s+\{(\d+)\}\r\n([\s\S]*?)(?=\r\n\s*BODY\[TEXT\]|\r\n\)|\r\nA\d+)/i);
          const headerBlock = headerMatch ? headerMatch[2] : block;

          const from = parseFrom(headerBlock);
          const subject = parseSubject(headerBlock);
          const date = parseDate(headerBlock);

          let bodyText: string | null = null;
          const bodyMatch = block.match(/BODY\[TEXT\]\s+\{(\d+)\}\r\n([\s\S]*?)(?=\r\n\)|\r\nA\d+)/i);
          if (bodyMatch) {
            bodyText = bodyMatch[2].trim();
            if (bodyText.length > 10000) {
              bodyText = bodyText.substring(0, 10000) + "\n...[truncated]";
            }
          }

          messages.push({
            account_id,
            from_email: from.email,
            from_name: from.name,
            subject,
            body: bodyText,
            received_at: date || new Date().toISOString(),
            message_uid: `${account_id}:${uid}`,
          });
        }
      }

      // Logout
      try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}

      console.log(`Parsed ${messages.length} messages, inserting`);

      if (messages.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("inbox_messages")
          .upsert(messages, { onConflict: "account_id,message_uid", ignoreDuplicates: true });

        if (insertError) {
          console.error("Upsert error:", insertError);
          let inserted = 0;
          for (const msg of messages) {
            const { error: singleErr } = await supabaseAdmin.from("inbox_messages").insert(msg);
            if (!singleErr) inserted++;
          }
          console.log(`Fallback: inserted ${inserted}/${messages.length}`);
        }
      }

      if (maxUid > lastSyncedUid) {
        await supabaseAdmin
          .from("email_accounts")
          .update({ last_synced_uid: maxUid } as any)
          .eq("id", account_id);
      }

      return new Response(JSON.stringify({
        message: `Synced ${messages.length} new messages`,
        synced: messages.length,
        last_uid: maxUid,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } finally {
      try { conn.close(); } catch {}
    }

  } catch (error: any) {
    console.error("inbox-sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

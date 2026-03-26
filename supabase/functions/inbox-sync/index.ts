import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── Buffered IMAP reader ──
class ImapReader {
  private conn: Deno.TlsConn | Deno.Conn;
  private buffer = "";
  constructor(conn: Deno.TlsConn | Deno.Conn) { this.conn = conn; }
  setConn(conn: Deno.TlsConn | Deno.Conn) { this.conn = conn; }

  private async fillBuffer(timeoutMs: number): Promise<boolean> {
    const buf = new Uint8Array(65536);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(false); } }, timeoutMs);
      this.conn.read(buf).then((n) => {
        clearTimeout(timer);
        if (done) return;
        done = true;
        if (n === null || n === 0) { resolve(false); } else {
          this.buffer += decoder.decode(buf.subarray(0, n));
          resolve(true);
        }
      }).catch(() => { clearTimeout(timer); if (!done) { done = true; resolve(false); } });
    });
  }

  async readUntilTag(tag: string, timeoutMs = 30000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const lines = this.buffer.split("\r\n");
      for (const line of lines) {
        if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
          const idx = this.buffer.indexOf(line) + line.length;
          const nextCrlf = this.buffer.indexOf("\r\n", idx);
          const result = this.buffer.substring(0, nextCrlf >= 0 ? nextCrlf + 2 : this.buffer.length);
          this.buffer = nextCrlf >= 0 ? this.buffer.substring(nextCrlf + 2) : "";
          return result;
        }
      }
      const remaining = Math.max(500, deadline - Date.now());
      const got = await this.fillBuffer(remaining);
      if (!got && this.buffer.length > 0) break;
      if (!got) break;
    }
    const result = this.buffer;
    this.buffer = "";
    return result;
  }

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
  for (const line of response.split("\r\n")) {
    if (line.startsWith(`${tag} OK`)) return;
    if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`))
      throw new Error(`IMAP error: ${line}`);
  }
  throw new Error(`No tagged response for ${tag}. Response (first 300 chars): ${response.substring(0, 300)}`);
}

async function sendCommand(reader: ImapReader, conn: Deno.TlsConn | Deno.Conn, tag: string, command: string): Promise<string> {
  await conn.write(encoder.encode(`${tag} ${command}\r\n`));
  return await reader.readUntilTag(tag, 30000);
}

// ── RFC 2047 header decoding ──
function decodeRfc2047(raw: string): string {
  return raw.replace(/=\?([^?]+)\?(B|Q)\?([^?]*)\?=/gi, (_match, _charset, encoding, encoded) => {
    try {
      if (encoding.toUpperCase() === "B") {
        return atob(encoded);
      }
      // Q encoding
      return encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    } catch { return encoded; }
  });
}

// ── Quoted-printable decoder ──
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "") // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ── Base64 decoder ──
function decodeBase64(text: string): string {
  try {
    const cleaned = text.replace(/\s/g, "");
    return atob(cleaned);
  } catch { return text; }
}

// ── Strip HTML tags to plain text ──
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── MIME parser: extract readable body from raw message ──
function parseMimeBody(rawBody: string, headerBlock: string): string {
  // Get content-type from headers
  const ctMatch = headerBlock.match(/^Content-Type:\s*(.+?)(?:\r?\n(?!\s)|\r?\n$)/ims);
  const contentType = ctMatch ? ctMatch[1].replace(/\s+/g, " ").trim() : "";

  // Get transfer encoding from headers
  const cteMatch = headerBlock.match(/^Content-Transfer-Encoding:\s*(\S+)/mi);
  const transferEncoding = cteMatch ? cteMatch[1].trim().toLowerCase() : "7bit";

  // Check if multipart
  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    return extractFromMultipart(rawBody, boundary);
  }

  // Single part — decode directly
  return decodePart(rawBody, transferEncoding, contentType);
}

function extractFromMultipart(body: string, boundary: string): string {
  const delim = "--" + boundary;
  const parts = body.split(delim);
  
  let plainText = "";
  let htmlText = "";

  for (const part of parts) {
    if (part.startsWith("--") || part.trim() === "") continue;

    // Split part headers from part body
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const partHeaders = part.substring(0, headerEnd);
    const partBody = part.substring(headerEnd + 4);

    const partCtMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
    const partCt = partCtMatch ? partCtMatch[1].trim().toLowerCase() : "";
    
    const partCteMatch = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const partCte = partCteMatch ? partCteMatch[1].trim().toLowerCase() : "7bit";

    // Check for nested multipart
    const nestedBoundary = partHeaders.match(/boundary="?([^";\s]+)"?/i);
    if (nestedBoundary) {
      const nested = extractFromMultipart(partBody, nestedBoundary[1]);
      if (nested) return nested;
      continue;
    }

    if (partCt.includes("text/plain")) {
      plainText = decodePart(partBody, partCte, partCt);
    } else if (partCt.includes("text/html")) {
      htmlText = decodePart(partBody, partCte, partCt);
    }
    // skip attachments, images, etc.
  }

  if (plainText.trim()) return plainText.trim();
  if (htmlText.trim()) return htmlToPlainText(htmlText);
  return "";
}

function decodePart(body: string, encoding: string, contentType: string): string {
  // Remove trailing boundary markers
  let cleaned = body.replace(/--[^\r\n]+--\s*$/, "").trim();

  if (encoding === "quoted-printable") {
    cleaned = decodeQuotedPrintable(cleaned);
  } else if (encoding === "base64") {
    cleaned = decodeBase64(cleaned);
  }

  // If it's HTML, convert to plain text
  if (contentType.toLowerCase().includes("text/html")) {
    cleaned = htmlToPlainText(cleaned);
  }

  return cleaned;
}

// ── Header parsers ──
function parseFrom(headerBlock: string): { name: string | null; email: string | null } {
  const fromMatch = headerBlock.match(/^From:\s*(.+)$/mi);
  if (!fromMatch) return { name: null, email: null };
  const raw = decodeRfc2047(fromMatch[1].trim());
  const angleMatch = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>/);
  if (angleMatch) return { name: angleMatch[1].trim() || null, email: angleMatch[2].trim() };
  return { name: null, email: raw };
}

function parseSubject(headerBlock: string): string | null {
  const m = headerBlock.match(/^Subject:\s*(.+)$/mi);
  return m ? decodeRfc2047(m[1].trim()) : null;
}

function parseDate(headerBlock: string): string | null {
  const m = headerBlock.match(/^Date:\s*(.+)$/mi);
  if (!m) return null;
  try { return new Date(m[1].trim()).toISOString(); } catch { return new Date().toISOString(); }
}

// ── Main handler ──
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
      .from("email_accounts").select("*").eq("id", account_id).eq("user_id", userId).single();

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
      const greeting = await reader.readGreeting(10000);
      console.log("Greeting:", greeting.trim());
      if (!greeting.includes("OK")) throw new Error(`Server rejected connection: ${greeting.substring(0, 200)}`);

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
        for (const p of searchLine.replace("* SEARCH", "").trim().split(/\s+/)) {
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
        account_id: string; from_email: string | null; from_name: string | null;
        subject: string | null; body: string | null; received_at: string; message_uid: string;
      }> = [];

      // Fetch full RFC822 message so we can parse MIME properly
      for (let i = 0; i < fetchUids.length; i += 10) {
        const batch = fetchUids.slice(i, i + 10);
        const uidList = batch.join(",");
        const fetchTag = nextTag();
        const fetchResp = await sendCommand(
          reader, conn, fetchTag,
          `UID FETCH ${uidList} (UID RFC822)`
        );

        // Split on FETCH responses
        const fetchBlocks = fetchResp.split(/\*\s+\d+\s+FETCH\s+/i).filter(b => b.trim());

        for (const block of fetchBlocks) {
          const uidMatch = block.match(/UID\s+(\d+)/i);
          if (!uidMatch) continue;
          const uid = parseInt(uidMatch[1]);
          if (uid > maxUid) maxUid = uid;

          // Extract RFC822 literal: {size}\r\n<message>
          const literalMatch = block.match(/RFC822\}\s*\{(\d+)\}\r\n([\s\S]*)/i);
          let rawMessage = "";
          if (literalMatch) {
            rawMessage = literalMatch[2];
          } else {
            // Try alternate format
            const altMatch = block.match(/RFC822\s+\{(\d+)\}\r\n([\s\S]*)/i);
            if (altMatch) rawMessage = altMatch[2];
            else {
              // Fallback: take everything after first \r\n
              const firstLine = block.indexOf("\r\n");
              if (firstLine > 0) rawMessage = block.substring(firstLine + 2);
            }
          }

          if (!rawMessage) continue;

          // Split headers and body
          const headerBodySep = rawMessage.indexOf("\r\n\r\n");
          const fullHeaders = headerBodySep > 0 ? rawMessage.substring(0, headerBodySep) : rawMessage;
          const rawBody = headerBodySep > 0 ? rawMessage.substring(headerBodySep + 4) : "";

          const from = parseFrom(fullHeaders);
          const subject = parseSubject(fullHeaders);
          const date = parseDate(fullHeaders);

          let bodyText = "";
          try {
            bodyText = parseMimeBody(rawBody, fullHeaders);
          } catch (e) {
            console.error("MIME parse error, using raw:", e);
            bodyText = rawBody.substring(0, 5000);
          }

          // Truncate
          if (bodyText.length > 10000) {
            bodyText = bodyText.substring(0, 10000) + "\n...[truncated]";
          }

          messages.push({
            account_id,
            from_email: from.email,
            from_name: from.name,
            subject,
            body: bodyText || null,
            received_at: date || new Date().toISOString(),
            message_uid: `${account_id}:${uid}`,
          });
        }
      }

      try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}

      console.log(`Parsed ${messages.length} messages, inserting`);

      if (messages.length > 0) {
        // Use upsert without ignoreDuplicates so existing broken messages get repaired
        const { error: insertError } = await supabaseAdmin
          .from("inbox_messages")
          .upsert(messages, { onConflict: "account_id,message_uid" });

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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

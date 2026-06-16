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

// ── MIME parser: extract readable body (plain + html) from raw message ──
function parseMimeBody(rawBody: string, headerBlock: string): { plain: string; html: string } {
  const ctMatch = headerBlock.match(/^Content-Type:\s*(.+?)(?:\r?\n(?!\s)|\r?\n$)/ims);
  const contentType = ctMatch ? ctMatch[1].replace(/\s+/g, " ").trim() : "";
  const cteMatch = headerBlock.match(/^Content-Transfer-Encoding:\s*(\S+)/mi);
  const transferEncoding = cteMatch ? cteMatch[1].trim().toLowerCase() : "7bit";
  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);

  if (boundaryMatch) {
    return extractFromMultipart(rawBody, boundaryMatch[1]);
  }
  const decoded = decodePartRaw(rawBody, transferEncoding);
  if (contentType.toLowerCase().includes("text/html")) {
    return { plain: htmlToPlainText(decoded), html: decoded };
  }
  return { plain: decoded, html: "" };
}

function extractFromMultipart(body: string, boundary: string): { plain: string; html: string } {
  const delim = "--" + boundary;
  const parts = body.split(delim);
  let plainText = "";
  let htmlText = "";

  for (const part of parts) {
    if (part.startsWith("--") || part.trim() === "") continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const partHeaders = part.substring(0, headerEnd);
    const partBody = part.substring(headerEnd + 4);
    const partCtMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
    const partCt = partCtMatch ? partCtMatch[1].trim().toLowerCase() : "";
    const partCteMatch = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    const partCte = partCteMatch ? partCteMatch[1].trim().toLowerCase() : "7bit";

    const nestedBoundary = partHeaders.match(/boundary="?([^";\s]+)"?/i);
    if (nestedBoundary) {
      const nested = extractFromMultipart(partBody, nestedBoundary[1]);
      if (nested.plain && !plainText) plainText = nested.plain;
      if (nested.html && !htmlText) htmlText = nested.html;
      continue;
    }

    if (partCt.includes("text/plain") && !plainText) {
      plainText = decodePartRaw(partBody, partCte);
    } else if (partCt.includes("text/html") && !htmlText) {
      htmlText = decodePartRaw(partBody, partCte);
    }
  }

  if (!plainText && htmlText) plainText = htmlToPlainText(htmlText);
  return { plain: plainText.trim(), html: htmlText.trim() };
}

function decodePartRaw(body: string, encoding: string): string {
  let cleaned = body.replace(/--[^\r\n]+--\s*$/, "").trim();
  if (encoding === "quoted-printable") cleaned = decodeQuotedPrintable(cleaned);
  else if (encoding === "base64") cleaned = decodeBase64(cleaned);
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

function parseSingleHeader(headerBlock: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "mi");
  const m = headerBlock.match(re);
  return m ? m[1].trim() : null;
}

function parseAllHeaders(headerBlock: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Unfold headers (lines starting with whitespace are continuations)
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

function normalizeSubjectKey(s: string | null): string {
  if (!s) return "";
  return s.replace(/^(re|fwd|fw):\s*/gi, "").trim().toLowerCase();
}

// ── Per-account sync (shared by single + fetch_all modes) ──
async function syncAccount(account: any, supabaseAdmin: any, opts: { maxFetch?: number } = {}): Promise<{ synced: number; last_uid?: number }> {
  const account_id = account.id;
  const imapHost = account.imap_host;
  const imapPort = account.imap_port || 993;
  const username = account.imap_username || account.username || account.email;
  const password = account.imap_password || account.password;
  const lastSyncedUid = account.last_synced_uid || 0;
  const maxFetch = opts.maxFetch ?? 50;

  if (!imapHost) throw new Error("IMAP host not configured for this account.");

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

    const escapedUser = username.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedPass = password.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const loginTag = nextTag();
    const loginResp = await sendCommand(reader, conn, loginTag, `LOGIN "${escapedUser}" "${escapedPass}"`);
    checkOk(loginResp, loginTag);

    const selectTag = nextTag();
    const selectResp = await sendCommand(reader, conn, selectTag, "SELECT INBOX");
    checkOk(selectResp, selectTag);

    const existsMatch = selectResp.match(/\*\s+(\d+)\s+EXISTS/i);
    const totalMessages = existsMatch ? parseInt(existsMatch[1]) : 0;

    if (totalMessages === 0) {
      try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}
      return { synced: 0 };
    }

    const searchTag = nextTag();
    const searchCmd = lastSyncedUid > 0
      ? `UID SEARCH UID ${lastSyncedUid + 1}:*`
      : `UID SEARCH ${Math.max(1, totalMessages - 49)}:*`;
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

    if (uids.length === 0) {
      try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}
      return { synced: 0 };
    }

    const fetchUids = uids.slice(0, maxFetch);
    let maxUid = lastSyncedUid;

    const messages: any[] = [];

    for (let i = 0; i < fetchUids.length; i += 10) {
      const batch = fetchUids.slice(i, i + 10);
      const fetchTag = nextTag();
      const fetchResp = await sendCommand(reader, conn, fetchTag, `UID FETCH ${batch.join(",")} (UID RFC822)`);

      const fetchBlocks = fetchResp.split(/\*\s+\d+\s+FETCH\s+/i).filter(b => b.trim());

      for (const block of fetchBlocks) {
        const uidMatch = block.match(/UID\s+(\d+)/i);
        if (!uidMatch) continue;
        const uid = parseInt(uidMatch[1]);
        if (uid > maxUid) maxUid = uid;

        const literalMatch = block.match(/RFC822\}\s*\{(\d+)\}\r\n([\s\S]*)/i);
        let rawMessage = "";
        if (literalMatch) rawMessage = literalMatch[2];
        else {
          const altMatch = block.match(/RFC822\s+\{(\d+)\}\r\n([\s\S]*)/i);
          if (altMatch) rawMessage = altMatch[2];
          else {
            const firstLine = block.indexOf("\r\n");
            if (firstLine > 0) rawMessage = block.substring(firstLine + 2);
          }
        }
        if (!rawMessage) continue;

        const headerBodySep = rawMessage.indexOf("\r\n\r\n");
        const fullHeaders = headerBodySep > 0 ? rawMessage.substring(0, headerBodySep) : rawMessage;
        const rawBody = headerBodySep > 0 ? rawMessage.substring(headerBodySep + 4) : "";

        const from = parseFrom(fullHeaders);
        const subject = parseSubject(fullHeaders);
        const date = parseDate(fullHeaders);
        const messageId = parseSingleHeader(fullHeaders, "Message-ID");
        const inReplyTo = parseSingleHeader(fullHeaders, "In-Reply-To");
        const references = parseSingleHeader(fullHeaders, "References");
        const rawHeaders = parseAllHeaders(fullHeaders);

        let parsed: { plain: string; html: string } = { plain: "", html: "" };
        try {
          parsed = parseMimeBody(rawBody, fullHeaders);
        } catch (e) {
          console.error("MIME parse error, using raw:", e);
          parsed = { plain: rawBody.substring(0, 5000), html: "" };
        }
        let bodyText = parsed.plain;
        if (bodyText.length > 10000) bodyText = bodyText.substring(0, 10000) + "\n...[truncated]";
        let bodyHtml = parsed.html;
        if (bodyHtml.length > 50000) bodyHtml = bodyHtml.substring(0, 50000);

        messages.push({
          account_id,
          from_email: from.email,
          from_name: from.name,
          subject,
          body: bodyText || null,
          body_html: bodyHtml || null,
          received_at: date || new Date().toISOString(),
          message_uid: `${account_id}:${uid}`,
          message_id: messageId,
          in_reply_to: inReplyTo,
          references,
          raw_headers: rawHeaders,
        });
      }
    }

    try { await sendCommand(reader, conn, nextTag(), "LOGOUT"); } catch {}

    // ── Threading: batch parent-message lookup (one query instead of N) ──
    const parentRefs = Array.from(new Set(
      messages
        .map((m) => m.in_reply_to || (m.references ? m.references.trim().split(/\s+/).pop() : null))
        .filter((r): r is string => !!r),
    ));
    let parentMap = new Map<string, string>();
    if (parentRefs.length > 0) {
      const { data: parents } = await supabaseAdmin
        .from("inbox_messages")
        .select("message_id, thread_id")
        .eq("account_id", account_id)
        .in("message_id", parentRefs);
      for (const p of parents || []) {
        if (p.message_id && p.thread_id) parentMap.set(p.message_id, p.thread_id);
      }
    }

    for (const msg of messages) {
      let threadId: string | null = null;
      const parentRef = msg.in_reply_to || (msg.references ? msg.references.trim().split(/\s+/).pop() : null);
      if (parentRef) {
        threadId = parentMap.get(parentRef) || null;
        if (!threadId) {
          const inBatch = messages.find((m) => m.message_id === parentRef);
          if (inBatch?.thread_id) threadId = inBatch.thread_id;
        }
      }
      // Subject-based fallback only when no parent ref existed (cheap cases only)
      if (!threadId && !parentRef && msg.subject) {
        const subjKey = normalizeSubjectKey(msg.subject);
        if (subjKey && /^(re|fwd|fw):/i.test(msg.subject)) {
          const since = new Date(Date.now() - 30 * 86400_000).toISOString();
          const { data: sibling } = await supabaseAdmin
            .from("inbox_messages")
            .select("thread_id, subject")
            .eq("account_id", account_id)
            .gte("received_at", since)
            .limit(20);
          const match = sibling?.find((s: any) => normalizeSubjectKey(s.subject) === subjKey && s.thread_id);
          if (match) threadId = match.thread_id;
        }
      }
      msg.thread_id = threadId || msg.message_id || msg.message_uid;
    }

    if (messages.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("inbox_messages")
        .upsert(messages, { onConflict: "account_id,message_uid" });

      if (insertError) {
        console.error("Upsert error:", insertError);
        for (const msg of messages) {
          await supabaseAdmin.from("inbox_messages").insert(msg);
        }
      }
    }

    // Persist UID progress immediately so a later kill doesn't reprocess.
    if (maxUid > lastSyncedUid) {
      await supabaseAdmin.from("email_accounts").update({ last_synced_uid: maxUid }).eq("id", account_id);
    }

    // Emit email.replied events — batched contact lookup by sender email
    try {
      if (account.user_id && messages.length > 0) {
        const senderEmails = Array.from(new Set(
          messages.filter((m) => !m.is_warmup && m.from_email).map((m) => String(m.from_email).toLowerCase()),
        ));
        if (senderEmails.length > 0) {
          const { data: contactRows } = await supabaseAdmin
            .from("contacts")
            .select("id, email, campaign_id, replied_at, campaigns!inner(user_id)")
            .in("email", senderEmails)
            .eq("campaigns.user_id", account.user_id);
          const byEmail = new Map<string, any>();
          for (const c of contactRows || []) {
            if (c.email) byEmail.set(String(c.email).toLowerCase(), c);
          }
          for (const msg of messages) {
            if (msg.is_warmup || !msg.from_email) continue;
            const c = byEmail.get(String(msg.from_email).toLowerCase());
            if (!c) continue;
            if (!c.replied_at) {
              await supabaseAdmin
                .from("contacts")
                .update({ status: "replied", replied_at: new Date().toISOString() })
                .eq("id", c.id);
            }
            await supabaseAdmin.from("events").insert({
              user_id: account.user_id,
              contact_id: c.id,
              event_type: "email.replied",
              source: { account_id, campaign_id: c.campaign_id },
              payload: { subject: msg.subject ?? null },
            });
          }
        }
      }
    } catch (e) {
      console.error("inbox-sync reply event emit failed:", e);
    }

    return { synced: messages.length, last_uid: maxUid };
  } finally {
    try { conn.close(); } catch {}
  }
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));

    // ── Cron / batch mode ──
    if (body.fetch_all === true) {
      const { data: accounts, error: accListErr } = await supabaseAdmin
        .from("email_accounts")
        .select("*")
        .not("imap_host", "is", null);
      if (accListErr) throw accListErr;

      const ACCOUNT_TIMEOUT_MS = 8_000;
      const settled = await Promise.allSettled(
        (accounts || []).map((acc: any) =>
          Promise.race([
            syncAccount(acc, supabaseAdmin, { maxFetch: 25 }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("account sync timeout")), ACCOUNT_TIMEOUT_MS),
            ),
          ]).then(
            (r: any) => ({ account_id: acc.id, email: acc.email, synced: r.synced }),
            (e: any) => ({ account_id: acc.id, email: acc.email, error: String(e?.message || e) }),
          ),
        ),
      );
      const results = settled.map((s) => (s.status === "fulfilled" ? s.value : { error: String(s.reason) }));
      return new Response(JSON.stringify({ mode: "fetch_all", count: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Single-account mode (authenticated user) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const account_id = body.account_id;
    if (!account_id) {
      return new Response(JSON.stringify({ error: "account_id required" }), { status: 400, headers: corsHeaders });
    }

    const { data: account, error: accError } = await supabaseAdmin
      .from("email_accounts").select("*").eq("id", account_id).eq("user_id", user.id).single();
    if (accError || !account) {
      return new Response(JSON.stringify({ error: "Account not found or access denied" }), { status: 404, headers: corsHeaders });
    }

    const r = await syncAccount(account, supabaseAdmin);
    return new Response(JSON.stringify({
      message: `Synced ${r.synced} new messages`,
      synced: r.synced,
      last_uid: r.last_uid,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("inbox-sync error:", error);
    const msg = String(error?.message || error);
    const isAuth = /AUTHENTICATIONFAILED|Authentication failed|LOGIN failed|Invalid credentials/i.test(msg);
    // Return 200 with success:false so supabase.functions.invoke doesn't throw
    // and the UI can render the error inline instead of blank-screening.
    return new Response(JSON.stringify({
      success: false,
      error: isAuth
        ? "IMAP authentication failed. Update credentials in Accounts → Edit."
        : msg,
      code: isAuth ? "imap_auth_failed" : "imap_error",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});



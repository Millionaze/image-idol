import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Read all available data from connection with a timeout
async function readResponse(conn: Deno.TlsConn | Deno.Conn, timeoutMs = 10000): Promise<string> {
  const buf = new Uint8Array(65536);
  let result = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const n = await Promise.race([
        conn.read(buf),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(100, deadline - Date.now())))
      ]);
      if (n === null) break;
      if (n === 0) break;
      result += decoder.decode(buf.subarray(0, n as number));
      // Check if we have a complete response (ends with \r\n after a tagged or untagged line)
      if (result.endsWith("\r\n")) {
        // Give a tiny bit more time to see if more data follows
        await new Promise(r => setTimeout(r, 50));
        // Try one more non-blocking read
        const extra = await Promise.race([
          conn.read(buf),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))
        ]);
        if (extra !== null && (extra as number) > 0) {
          result += decoder.decode(buf.subarray(0, extra as number));
        } else {
          break;
        }
      }
    } catch {
      break;
    }
  }
  return result;
}

// Read until we see the tagged response line
async function readTaggedResponse(conn: Deno.TlsConn | Deno.Conn, tag: string, timeoutMs = 15000): Promise<string> {
  const buf = new Uint8Array(65536);
  let result = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(100, deadline - Date.now());
    const n = await Promise.race([
      conn.read(buf),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining))
    ]);
    if (n === null) break;
    if (n === 0) break;
    result += decoder.decode(buf.subarray(0, n as number));
    // Check if tagged response has arrived
    const lines = result.split("\r\n");
    for (const line of lines) {
      if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
        return result;
      }
    }
  }
  return result;
}

async function sendCommand(conn: Deno.TlsConn | Deno.Conn, tag: string, command: string): Promise<string> {
  const line = `${tag} ${command}\r\n`;
  await conn.write(encoder.encode(line));
  return await readTaggedResponse(conn, tag);
}

function checkOk(response: string, tag: string): void {
  const lines = response.split("\r\n");
  for (const line of lines) {
    if (line.startsWith(`${tag} OK`)) return;
    if (line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
      throw new Error(`IMAP error: ${line}`);
    }
  }
  throw new Error(`No tagged response found for ${tag} in: ${response.substring(0, 200)}`);
}

// Parse "From" header — handles "Name <email>" and bare "email" formats
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { account_id } = await req.json();
    if (!account_id) {
      return new Response(JSON.stringify({ error: "account_id required" }), { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch account details
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
      return new Response(JSON.stringify({ error: "IMAP host not configured for this account. Please add IMAP host in account settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Connecting to IMAP server ${imapHost}:${imapPort} for account ${account.email}`);

    // Connect via TLS (port 993) or plain
    let conn: Deno.TlsConn | Deno.Conn;
    if (imapPort === 993) {
      conn = await Deno.connectTls({ hostname: imapHost, port: imapPort });
    } else {
      conn = await Deno.connect({ hostname: imapHost, port: imapPort });
    }

    try {
      // Read greeting
      const greeting = await readResponse(conn, 5000);
      console.log("IMAP greeting:", greeting.substring(0, 200));
      if (!greeting.includes("OK")) {
        throw new Error(`IMAP server rejected connection: ${greeting.substring(0, 200)}`);
      }

      // STARTTLS for non-993 ports
      if (imapPort !== 993) {
        const starttlsResp = await sendCommand(conn, "T0", "STARTTLS");
        if (starttlsResp.includes("T0 OK")) {
          conn = await Deno.startTls(conn as Deno.Conn, { hostname: imapHost });
        }
      }

      let tagNum = 1;
      const nextTag = () => `A${tagNum++}`;

      // LOGIN
      const loginTag = nextTag();
      const loginResp = await sendCommand(conn, loginTag, `LOGIN "${username.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" "${password.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
      checkOk(loginResp, loginTag);
      console.log("IMAP login successful");

      // SELECT INBOX
      const selectTag = nextTag();
      const selectResp = await sendCommand(conn, selectTag, "SELECT INBOX");
      checkOk(selectResp, selectTag);

      // Extract EXISTS count
      const existsMatch = selectResp.match(/\*\s+(\d+)\s+EXISTS/i);
      const totalMessages = existsMatch ? parseInt(existsMatch[1]) : 0;
      console.log(`INBOX has ${totalMessages} messages, last synced UID: ${lastSyncedUid}`);

      if (totalMessages === 0) {
        // Logout
        const logoutTag = nextTag();
        await sendCommand(conn, logoutTag, "LOGOUT");
        return new Response(JSON.stringify({ message: "Inbox is empty", synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // UID SEARCH for new messages
      const searchTag = nextTag();
      let searchCmd: string;
      if (lastSyncedUid > 0) {
        searchCmd = `UID SEARCH UID ${lastSyncedUid + 1}:*`;
      } else {
        // First sync — get last 50 messages by sequence number
        const startSeq = Math.max(1, totalMessages - 49);
        searchCmd = `UID SEARCH ${startSeq}:*`;
      }
      const searchResp = await sendCommand(conn, searchTag, searchCmd);
      checkOk(searchResp, searchTag);

      // Parse UIDs from SEARCH response
      const searchLine = searchResp.split("\r\n").find(l => l.startsWith("* SEARCH"));
      const uids: number[] = [];
      if (searchLine) {
        const parts = searchLine.replace("* SEARCH", "").trim().split(/\s+/);
        for (const p of parts) {
          const uid = parseInt(p);
          if (!isNaN(uid) && uid > lastSyncedUid) {
            uids.push(uid);
          }
        }
      }

      console.log(`Found ${uids.length} new UIDs to fetch`);

      if (uids.length === 0) {
        const logoutTag = nextTag();
        await sendCommand(conn, logoutTag, "LOGOUT");
        return new Response(JSON.stringify({ message: "No new messages", synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Limit to 50 messages per sync
      const fetchUids = uids.slice(0, 50);
      let maxUid = lastSyncedUid;

      // Fetch in batches of 10
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

        // Fetch headers and body text
        const fetchResp = await sendCommand(
          conn,
          fetchTag,
          `UID FETCH ${uidList} (UID BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`
        );

        // Parse fetch responses — split by "* N FETCH"
        const fetchBlocks = fetchResp.split(/\*\s+\d+\s+FETCH\s+/i).filter(b => b.trim());

        for (const block of fetchBlocks) {
          // Extract UID
          const uidMatch = block.match(/UID\s+(\d+)/i);
          if (!uidMatch) continue;
          const uid = parseInt(uidMatch[1]);
          if (uid > maxUid) maxUid = uid;

          // Extract header block (between BODY[HEADER...] and the next BODY or closing paren)
          const headerMatch = block.match(/BODY\[HEADER\.FIELDS\s+\([^)]+\)\]\s+\{(\d+)\}\r\n([\s\S]*?)(?=\r\n\s*BODY\[TEXT\]|\r\n\)|\r\nA\d+)/i);
          const headerBlock = headerMatch ? headerMatch[2] : block;

          const from = parseFrom(headerBlock);
          const subject = parseSubject(headerBlock);
          const date = parseDate(headerBlock);

          // Extract body text
          let bodyText: string | null = null;
          const bodyMatch = block.match(/BODY\[TEXT\]\s+\{(\d+)\}\r\n([\s\S]*?)(?=\r\n\)|\r\nA\d+)/i);
          if (bodyMatch) {
            bodyText = bodyMatch[2].trim();
            // Truncate very long bodies
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
      const logoutTag = nextTag();
      try { await sendCommand(conn, logoutTag, "LOGOUT"); } catch { /* ignore logout errors */ }

      console.log(`Parsed ${messages.length} messages, inserting into database`);

      // Upsert messages (deduplicate by message_uid)
      if (messages.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("inbox_messages")
          .upsert(messages, { onConflict: "account_id,message_uid", ignoreDuplicates: true });

        if (insertError) {
          console.error("Insert error:", insertError);
          // Fall back to individual inserts if upsert fails
          let inserted = 0;
          for (const msg of messages) {
            const { error: singleErr } = await supabaseAdmin
              .from("inbox_messages")
              .insert(msg);
            if (!singleErr) inserted++;
          }
          console.log(`Fallback: inserted ${inserted}/${messages.length} messages`);
        }
      }

      // Update last_synced_uid
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
      try { conn.close(); } catch { /* ignore */ }
    }

  } catch (error: any) {
    console.error("inbox-sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

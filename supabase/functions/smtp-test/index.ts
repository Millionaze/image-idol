const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readResponse(conn: Deno.TcpConn | Deno.TlsConn): Promise<string> {
  let full = "";
  const buf = new Uint8Array(4096);
  while (true) {
    const n = await conn.read(buf);
    if (!n) break;
    full += decoder.decode(buf.subarray(0, n));
    const lines = full.trim().split("\r\n");
    const last = lines[lines.length - 1];
    if (last.length >= 4 && last[3] === " ") break;
    if (lines.length === 1 && last.length >= 3) break;
  }
  return full;
}

async function sendCmd(conn: Deno.TcpConn | Deno.TlsConn, cmd: string): Promise<string> {
  await conn.write(encoder.encode(cmd + "\r\n"));
  return await readResponse(conn);
}

type AttemptResult =
  | { ok: true }
  | { ok: false; code: "connection_reset" | "connection_timeout" | "unknown_host" | "tls_failed" | "auth_failed" | "other"; message: string };

async function attemptSmtp(
  host: string,
  port: number,
  secure: boolean,
  username: string,
  password: string,
): Promise<AttemptResult> {
  let conn: Deno.TcpConn | Deno.TlsConn;
  try {
    if (secure && port === 465) {
      conn = await Deno.connectTls({ hostname: host, port });
    } else {
      conn = await Deno.connect({ hostname: host, port });
    }
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(`SMTP connect failed (${host}:${port} secure=${secure}):`, msg);
    if (/NotFound|dns|resolve/i.test(msg)) return { ok: false, code: "unknown_host", message: msg };
    if (/reset by peer|ConnectionReset|104/i.test(msg)) return { ok: false, code: "connection_reset", message: msg };
    if (/timed out|timeout/i.test(msg)) return { ok: false, code: "connection_timeout", message: msg };
    if (/tls|certificate|handshake/i.test(msg)) return { ok: false, code: "tls_failed", message: msg };
    return { ok: false, code: "other", message: msg };
  }

  try {
    const greeting = await readResponse(conn);
    if (!greeting.startsWith("220")) {
      try { conn.close(); } catch (_) { /* noop */ }
      return { ok: false, code: "other", message: `Unexpected greeting: ${greeting.trim()}` };
    }

    let ehlo = await sendCmd(conn, "EHLO pixelgrowth");

    if (!secure || port === 587) {
      if (ehlo.includes("STARTTLS")) {
        const tlsResp = await sendCmd(conn, "STARTTLS");
        if (tlsResp.startsWith("220")) {
          conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host });
          ehlo = await sendCmd(conn, "EHLO pixelgrowth");
        }
      }
    }

    let authSuccess = false;
    const authLoginResp = await sendCmd(conn, "AUTH LOGIN");
    if (authLoginResp.startsWith("334")) {
      const userResp = await sendCmd(conn, btoa(username));
      if (userResp.startsWith("334")) {
        const passResp = await sendCmd(conn, btoa(password));
        if (passResp.startsWith("235")) authSuccess = true;
      }
    }

    if (!authSuccess) {
      const plainToken = btoa(`\0${username}\0${password}`);
      const plainResp = await sendCmd(conn, `AUTH PLAIN ${plainToken}`);
      if (plainResp.startsWith("235")) authSuccess = true;
    }

    try { await sendCmd(conn, "QUIT"); } catch (_) { /* noop */ }
    try { conn.close(); } catch (_) { /* noop */ }

    if (!authSuccess) return { ok: false, code: "auth_failed", message: "Authentication failed — check username and password" };
    return { ok: true };
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(`SMTP session failed (${host}:${port}):`, msg);
    try { conn.close(); } catch (_) { /* noop */ }
    if (/reset by peer|ConnectionReset|104/i.test(msg)) return { ok: false, code: "connection_reset", message: msg };
    if (/timed out|timeout/i.test(msg)) return { ok: false, code: "connection_timeout", message: msg };
    if (/tls|certificate|handshake|InvalidData/i.test(msg)) return { ok: false, code: "tls_failed", message: msg };
    return { ok: false, code: "other", message: msg };
  }
}

function buildErrorMessage(code: AttemptResult extends { ok: false; code: infer C } ? C : never, port: number, host: string, raw: string): string {
  const isSecureserver = /secureserver\.net/i.test(host);
  switch (code) {
    case "connection_reset":
    case "connection_timeout":
      return (
        `Your provider reset the connection on port ${port}. ` +
        (isSecureserver
          ? `This is common with GoDaddy on port 465 from cloud IPs. Try host "smtpout.secureserver.net" on port 587 (TLS off — STARTTLS will be used automatically). If your mailbox was migrated to Microsoft 365, use "smtp.office365.com" on port 587 instead.`
          : `Try port 587 with TLS off (STARTTLS), or confirm your provider allows SMTP from external servers.`)
      );
    case "unknown_host":
      return (
        `Hostname "${host}" could not be resolved. ` +
        (isSecureserver
          ? `For GoDaddy Workspace Email use "smtpout.secureserver.net". For GoDaddy-resold Microsoft 365 use "smtp.office365.com".`
          : `Double-check the SMTP host spelling.`)
      );
    case "tls_failed":
      return `TLS handshake failed on port ${port}. If you're on port 465, try port 587 with TLS off (STARTTLS). If you're on port 587, make sure TLS is off so STARTTLS is used.`;
    case "auth_failed":
      return "Authentication failed — check the username and password (most providers require an app password, not your login password).";
    default:
      return `Connection failed: ${raw}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { smtp_host, smtp_port, smtp_secure, username, password } = await req.json();

    if (!smtp_host || !smtp_port || !username || !password) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const first = await attemptSmtp(smtp_host, smtp_port, !!smtp_secure, username, password);

    if (first.ok) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-fallback: if 465 failed with a network/TLS issue (not bad auth), try 587 + STARTTLS
    const shouldFallback =
      smtp_port === 465 &&
      (first.code === "connection_reset" || first.code === "connection_timeout" || first.code === "tls_failed");

    if (shouldFallback) {
      const retry = await attemptSmtp(smtp_host, 587, false, username, password);
      if (retry.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            suggestedPort: 587,
            suggestedSecure: false,
            note: `Port 465 was reset by ${smtp_host}, but port 587 with STARTTLS worked. Save with these settings instead.`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        errorCode: first.code,
        error: buildErrorMessage(first.code, smtp_port, smtp_host, first.message),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

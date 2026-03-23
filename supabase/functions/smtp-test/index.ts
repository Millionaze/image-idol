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
    // Check if we have a complete response (final line has space after code, not dash)
    const lines = full.trim().split("\r\n");
    const last = lines[lines.length - 1];
    if (last.length >= 4 && last[3] === " ") break;
    // Also break on single-line responses
    if (lines.length === 1 && last.length >= 3) break;
  }
  return full;
}

async function sendCmd(conn: Deno.TcpConn | Deno.TlsConn, cmd: string): Promise<string> {
  await conn.write(encoder.encode(cmd + "\r\n"));
  return await readResponse(conn);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { smtp_host, smtp_port, smtp_secure, username, password } = await req.json();

    if (!smtp_host || !smtp_port || !username || !password) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let conn: Deno.TcpConn | Deno.TlsConn;
    try {
      // Connect
      if (smtp_secure && smtp_port === 465) {
        conn = await Deno.connectTls({ hostname: smtp_host, port: smtp_port });
      } else {
        conn = await Deno.connect({ hostname: smtp_host, port: smtp_port });
      }

      // Read greeting
      const greeting = await readResponse(conn);
      console.log("SMTP greeting:", greeting.trim());
      if (!greeting.startsWith("220")) {
        conn.close();
        return new Response(JSON.stringify({ success: false, error: `Unexpected greeting: ${greeting.trim()}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // EHLO
      let ehlo = await sendCmd(conn, "EHLO mailforge");
      console.log("EHLO response:", ehlo.trim());

      // STARTTLS if needed (port 587 or server advertises it on plain connection)
      if (!smtp_secure || smtp_port === 587) {
        if (ehlo.includes("STARTTLS")) {
          const tlsResp = await sendCmd(conn, "STARTTLS");
          console.log("STARTTLS response:", tlsResp.trim());
          if (tlsResp.startsWith("220")) {
            conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: smtp_host });
            // Re-EHLO after TLS upgrade
            ehlo = await sendCmd(conn, "EHLO mailforge");
            console.log("Post-TLS EHLO:", ehlo.trim());
          }
        }
      }

      // Try AUTH LOGIN first
      let authSuccess = false;
      const authLoginResp = await sendCmd(conn, "AUTH LOGIN");
      console.log("AUTH LOGIN response:", authLoginResp.trim());

      if (authLoginResp.startsWith("334")) {
        // Send username
        const userResp = await sendCmd(conn, btoa(username));
        if (userResp.startsWith("334")) {
          // Send password
          const passResp = await sendCmd(conn, btoa(password));
          console.log("AUTH LOGIN result:", passResp.trim());
          if (passResp.startsWith("235")) {
            authSuccess = true;
          }
        }
      }

      // Fallback to AUTH PLAIN
      if (!authSuccess) {
        const plainToken = btoa(`\0${username}\0${password}`);
        const plainResp = await sendCmd(conn, `AUTH PLAIN ${plainToken}`);
        console.log("AUTH PLAIN result:", plainResp.trim());
        if (plainResp.startsWith("235")) {
          authSuccess = true;
        }
      }

      if (!authSuccess) {
        conn.close();
        return new Response(JSON.stringify({ success: false, error: "Authentication failed — check username and password" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await sendCmd(conn, "QUIT");
      conn.close();

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (connError: any) {
      console.error("SMTP test error:", connError.message);
      return new Response(JSON.stringify({ success: false, error: `Connection failed: ${connError.message}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

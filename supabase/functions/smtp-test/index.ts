const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Test TCP connectivity to the SMTP server
    let conn: Deno.TcpConn | Deno.TlsConn;
    try {
      if (smtp_secure) {
        conn = await Deno.connectTls({ hostname: smtp_host, port: smtp_port });
      } else {
        conn = await Deno.connect({ hostname: smtp_host, port: smtp_port });
      }

      // Read the SMTP greeting (should start with "220")
      const buf = new Uint8Array(1024);
      const n = await conn.read(buf);
      const greeting = n ? new TextDecoder().decode(buf.subarray(0, n)) : "";

      if (!greeting.startsWith("220")) {
        conn.close();
        return new Response(JSON.stringify({ success: false, error: `Unexpected SMTP greeting: ${greeting.trim()}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Send EHLO
      const encoder = new TextEncoder();
      await conn.write(encoder.encode(`EHLO mailforge\r\n`));
      const ehloBuf = new Uint8Array(2048);
      await conn.read(ehloBuf);

      // Attempt AUTH LOGIN
      await conn.write(encoder.encode(`AUTH LOGIN\r\n`));
      const authBuf = new Uint8Array(1024);
      const authN = await conn.read(authBuf);
      const authResp = authN ? new TextDecoder().decode(authBuf.subarray(0, authN)) : "";

      if (authResp.startsWith("334")) {
        // Send username (base64)
        await conn.write(encoder.encode(btoa(username) + "\r\n"));
        const userBuf = new Uint8Array(1024);
        await conn.read(userBuf);

        // Send password (base64)
        await conn.write(encoder.encode(btoa(password) + "\r\n"));
        const passBuf = new Uint8Array(1024);
        const passN = await conn.read(passBuf);
        const passResp = passN ? new TextDecoder().decode(passBuf.subarray(0, passN)) : "";

        if (!passResp.startsWith("235")) {
          conn.close();
          return new Response(JSON.stringify({ success: false, error: "Authentication failed — check username and password" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Send QUIT
      await conn.write(encoder.encode("QUIT\r\n"));
      conn.close();

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (connError: any) {
      return new Response(JSON.stringify({ success: false, error: `Connection failed: ${connError.message}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

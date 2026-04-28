import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  sanitizeForSmtp,
  sanitizeSubject,
  htmlToText,
  classifySmtpError,
} from "../_shared/smtp-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all active sequences due for sending
    const { data: dueStates, error: stateErr } = await supabase
      .from("contact_sequence_state")
      .select("*, contacts(*), campaigns(*, email_accounts(*))")
      .eq("status", "active")
      .lte("next_send_at", new Date().toISOString());

    if (stateErr) throw stateErr;
    if (!dueStates || dueStates.length === 0) {
      return new Response(JSON.stringify({ message: "No sequences due" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;

    for (const state of dueStates) {
      const contact = state.contacts;
      const campaign = state.campaigns;
      const account = campaign?.email_accounts;

      if (!contact || !campaign || !account) continue;

      // If contact has replied, mark completed
      if (contact.replied_at) {
        await supabase.from("contact_sequence_state").update({ status: "completed" }).eq("id", state.id);
        skipped++;
        continue;
      }

      // Get the current step
      const { data: step } = await supabase
        .from("sequence_steps")
        .select("*")
        .eq("campaign_id", campaign.id)
        .eq("step_number", state.current_step)
        .single();

      if (!step) {
        // No more steps, mark completed
        await supabase.from("contact_sequence_state").update({ status: "completed" }).eq("id", state.id);
        skipped++;
        continue;
      }

      try {
        const contactName = contact.name || contact.email.split("@")[0];
        const rawSubject = step.subject
          .replace(/\{\{name\}\}/g, contactName)
          .replace(/\{\{email\}\}/g, contact.email);
        const subject = sanitizeSubject(rawSubject);

        const trackBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-open`;
        const trackingPixel = `<img src="${trackBaseUrl}?id=${contact.id}" width="1" height="1" style="display:none;border:0;" alt="" />`;
        const rawBody = step.body
          .replace(/\{\{name\}\}/g, contactName)
          .replace(/\{\{email\}\}/g, contact.email) + trackingPixel;
        const html = sanitizeForSmtp(rawBody);
        const text = htmlToText(rawBody);

        const client = new SMTPClient({
          connection: {
            hostname: account.smtp_host,
            port: account.smtp_port,
            tls: account.smtp_secure,
            auth: { username: account.username, password: account.password },
          },
        });

        await client.send({
          from: account.email,
          to: contact.email,
          subject,
          content: text,
          html,
        });
        try { await client.close(); } catch { /* ignore */ }
        // Get next step
        const { data: nextStep } = await supabase
          .from("sequence_steps")
          .select("*")
          .eq("campaign_id", campaign.id)
          .eq("step_number", state.current_step + 1)
          .single();

        if (nextStep) {
          const nextSend = new Date();
          nextSend.setDate(nextSend.getDate() + nextStep.delay_days);
          nextSend.setHours(nextSend.getHours() + nextStep.delay_hours);

          await supabase.from("contact_sequence_state").update({
            current_step: state.current_step + 1,
            next_send_at: nextSend.toISOString(),
          }).eq("id", state.id);
        } else {
          await supabase.from("contact_sequence_state").update({ status: "completed" }).eq("id", state.id);
        }

        // Update campaign sent count
        await supabase.from("campaigns").update({
          sent_count: campaign.sent_count + 1,
        }).eq("id", campaign.id);

        await supabase.from("contacts").update({
          sent_at: new Date().toISOString(),
          status: "sent",
        }).eq("id", contact.id);

        // Emit workflow events
        const events: any[] = [
          { user_id: campaign.user_id, contact_id: contact.id, event_type: "email.sent", source: { campaign_id: campaign.id, sequence_step_id: step.id, account_id: account.id }, payload: { subject } },
        ];
        if (state.current_step === 1) {
          events.unshift({ user_id: campaign.user_id, contact_id: contact.id, event_type: "campaign.started", source: { campaign_id: campaign.id }, payload: {} });
        }
        await supabase.from("events").insert(events);

        processed++;
      } catch (e: any) {
        const classified = classifySmtpError(e);
        console.error(`Sequence send for ${contact.email} [${classified.kind} code=${classified.code}]:`, classified.message);

        if (classified.kind === "bounced") {
          await supabase.from("contacts").update({ status: "bounced" }).eq("id", contact.id);
        } else if (classified.kind === "failed") {
          await supabase.from("contacts").update({ status: "failed" }).eq("id", contact.id);
        }
        // transient: leave contact as-is, sequence state will retry on next cron tick

        await supabase.from("events").insert({
          user_id: campaign.user_id, contact_id: contact.id,
          event_type: classified.kind === "bounced" ? "email.bounced" : "email.failed",
          source: { campaign_id: campaign.id, sequence_step_id: step.id },
          payload: { error: classified.message, code: classified.code, kind: classified.kind },
        });
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${processed} sequence sends, ${skipped} skipped` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

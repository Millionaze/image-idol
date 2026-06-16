// Reusable email sending helper used by send-campaign, process-sequences,
// and the workflow action executor.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import {
  sanitizeForSmtp,
  sanitizeSubject,
  htmlToText,
  classifySmtpError,
  type SmtpFailureKind,
} from "./smtp-helpers.ts";

export interface SendEmailParams {
  account: {
    id: string;
    email: string;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    username: string;
    password: string;
    user_id: string;
    name?: string | null;
  };
  to: string;
  subject: string;
  htmlBody: string;
  contactId?: string;
  trackOpens?: boolean;
  trackingBaseUrl?: string;
  customTrackingDomain?: string | null;
  /** Custom RFC-5322 headers (e.g. In-Reply-To, References). */
  headers?: Record<string, string>;
  /** Send body as plain text only — no HTML alternative, no tracking pixel. */
  plainTextOnly?: boolean;
}

export async function sendEmailViaAccount(
  params: SendEmailParams,
): Promise<{ success: boolean; error?: string; failureKind?: SmtpFailureKind; code?: number | null }> {
  const { account, to, subject, htmlBody, contactId, trackOpens = true, plainTextOnly = false } = params;

  let body = htmlBody;
  if (!plainTextOnly && trackOpens && contactId) {
    const base =
      params.customTrackingDomain
        ? `https://${params.customTrackingDomain}/functions/v1/track-open`
        : params.trackingBaseUrl ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/track-open`;
    body += `<img src="${base}?id=${contactId}" width="1" height="1" style="display:none;border:0;" alt="" />`;
  }

  const safeSubject = sanitizeSubject(subject);

  const client = new SMTPClient({
    connection: {
      hostname: account.smtp_host,
      port: account.smtp_port,
      tls: account.smtp_secure,
      auth: { username: account.username, password: account.password },
    },
  });

  try {
    const sendArgs: any = { from: account.email, to, subject: safeSubject };
    if (plainTextOnly) {
      sendArgs.content = body;
    } else {
      sendArgs.html = sanitizeForSmtp(body);
      sendArgs.content = htmlToText(body);
    }
    if (params.headers && Object.keys(params.headers).length > 0) {
      sendArgs.headers = params.headers;
    }
    await client.send(sendArgs);
    try { await client.close(); } catch { /* ignore */ }
    return { success: true };
  } catch (e: any) {
    try { await client.close(); } catch { /* ignore */ }
    const classified = classifySmtpError(e);
    return {
      success: false,
      error: classified.message,
      failureKind: classified.kind,
      code: classified.code,
    };
  }
}

export async function emitEvent(
  supabase: any,
  params: {
    user_id: string;
    contact_id?: string | null;
    event_type: string;
    source?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("events").insert({
    user_id: params.user_id,
    contact_id: params.contact_id ?? null,
    event_type: params.event_type,
    source: params.source ?? {},
    payload: params.payload ?? {},
  });
}

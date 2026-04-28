// Shared helpers for safe SMTP sending and error classification.

/**
 * Normalize line endings and strip control chars that break SMTP DATA mode.
 * RFC 5321/5322 require CRLF; bare LF triggers 552 "bare LF" rejections on
 * strict servers (e.g., Privateemail/Namecheap).
 */
export function sanitizeForSmtp(input: string): string {
  if (!input) return "";
  return input
    // strip null bytes and other dangerous control chars (keep \r, \n, \t)
    .replace(/[\x00\x08\x0B\x0C\x0E-\x1F]/g, "")
    // normalize all line endings to \n first
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // then convert every \n to proper \r\n
    .replace(/\n/g, "\r\n");
}

/** Subjects must be a single line — no CR/LF allowed at all. */
export function sanitizeSubject(input: string): string {
  if (!input) return "";
  return input.replace(/[\r\n\x00]+/g, " ").trim();
}

/** Convert HTML to a basic plain-text fallback for the multipart/alternative text part. */
export function htmlToText(html: string): string {
  return sanitizeForSmtp(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export type SmtpFailureKind = "bounced" | "failed" | "transient";

export interface ClassifiedSmtpError {
  kind: SmtpFailureKind;
  code: number | null;
  message: string;
  connectionFatal: boolean;
}

/**
 * Classify an error thrown by denomailer's client.send.
 * Only true recipient-side rejections (5.x.x mailbox/user errors) are
 * counted as "bounced". Everything else is "failed" (don't burn the contact
 * by counting it as a real bounce against deliverability).
 */
export function classifySmtpError(err: unknown): ClassifiedSmtpError {
  const message = String((err as any)?.message ?? err ?? "");
  const codeMatch = message.match(/\b([45]\d{2})\b/);
  const code = codeMatch ? parseInt(codeMatch[1], 10) : null;
  const lower = message.toLowerCase();

  const connectionFatal =
    lower.includes("connection not recoverable") ||
    lower.includes("error while in datamode") ||
    lower.includes("connection closed") ||
    lower.includes("connection reset") ||
    lower.includes("broken pipe");

  // Real recipient-side bounces
  const bounceCodes = new Set([550, 551, 553, 554]);
  const bounceWords = [
    "user unknown",
    "no such user",
    "mailbox unavailable",
    "mailbox not found",
    "recipient address rejected",
    "address rejected",
    "does not exist",
    "user not found",
    "no mailbox here",
    "invalid recipient",
  ];

  if (code && bounceCodes.has(code) && bounceWords.some((w) => lower.includes(w))) {
    return { kind: "bounced", code, message, connectionFatal };
  }

  // 421/45x are transient — could retry later
  if (code && code >= 400 && code < 500) {
    return { kind: "transient", code, message, connectionFatal };
  }

  // Everything else (552 bad message, auth failures, malformed body, 554 policy, etc.)
  return { kind: "failed", code, message, connectionFatal };
}

// Small helpers to append per-account signatures to outbound emails.
// Signatures are stored on email_accounts as `signature_html` and
// `signature_plain`. Merge tags in the signature are substituted the same
// way as the body ({{name}}, {{email}}).

export interface AccountSignature {
  signature_html?: string | null;
  signature_plain?: string | null;
}

function applyMergeTags(input: string, vars: Record<string, string>): string {
  let out = input;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), v ?? "");
  }
  return out;
}

/** Append the HTML signature (if any) to an HTML body. */
export function appendHtmlSignature(
  html: string,
  account: AccountSignature,
  vars: Record<string, string> = {},
): string {
  const sig = (account.signature_html || "").trim();
  if (!sig) return html;
  const rendered = applyMergeTags(sig, vars);
  return `${html}<br><br>${rendered}`;
}

/** Append the plain signature (if any) to a plain-text body. */
export function appendPlainSignature(
  text: string,
  account: AccountSignature,
  vars: Record<string, string> = {},
): string {
  const sig = (account.signature_plain || "").trim();
  if (!sig) return text;
  const rendered = applyMergeTags(sig, vars);
  return `${text}\n\n${rendered}`;
}

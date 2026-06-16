## Add open tracking to Plain Text campaigns

### Problem
Plain-text campaigns currently send with `content: personalizedBody` only — no HTML part, so the 1×1 tracking pixel can't be attached and opens always show 0.

### Fix
Send plain campaigns as **multipart/alternative**: keep the plain text body exactly as the user typed it (so inboxes still render it as plain text, preserving deliverability), and attach a minimal HTML alternative part that contains only the tracking pixel (plus the text re-wrapped in `<pre>` so the HTML part is valid). Most modern mail clients prefer the HTML part and fire the pixel; clients showing the plain part still get the raw text untouched.

denomailer's `client.send()` accepts both `content` and `html` together — that produces a multipart/alternative MIME message. We already do this for HTML mode; we just need to do it for plain mode too, with a different HTML body.

### Changes

**`supabase/functions/send-campaign/index.ts`** — in the plain branch:
```ts
const trackingPixel = `<img src="${trackBaseUrl}?id=${contact.id}" width="1" height="1" style="display:none;border:0;" alt="" />`;
const plainAsHtml =
  `<pre style="font-family:inherit;white-space:pre-wrap;margin:0;">` +
  escapeHtml(personalizedBody) +
  `</pre>` + trackingPixel;
await client.send({
  from: account.email,
  to: contact.email,
  subject,
  content: personalizedBody,   // unchanged plain text
  html: plainAsHtml,            // alt part carries the pixel
});
```
Add a tiny local `escapeHtml()` helper (or reuse one from `_shared/smtp-helpers.ts` if present).

**`supabase/functions/process-sequences/index.ts`** — same change in its plain branch. Needs the same `trackBaseUrl` lookup (currently only `send-campaign` reads the custom tracking domain from settings; `process-sequences` uses the default `SUPABASE_URL`). I'll mirror the settings lookup so sequence sends respect the custom tracking domain too.

**Campaign form hint (`src/pages/Campaigns.tsx`)** — update the plain-mode muted hint to: *"Plain text emails have higher deliverability for cold outreach. Open tracking is included via a hidden pixel in the HTML alternative part."*

### Out of scope
- No DB changes.
- No change to HTML-mode sending.
- Already-sent emails can't be retroactively tracked — only future sends will register opens.

### Caveat to flag to user
Adding any HTML alternative part technically makes the message multipart instead of pure `text/plain`. Some extremely strict spam filters weight pure-text higher, but in practice multipart/alternative is the industry norm (every major ESP does this) and deliverability impact is negligible. If you'd rather keep pure text/plain with **no** tracking, say so and I'll skip this.

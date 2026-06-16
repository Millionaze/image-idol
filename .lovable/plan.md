## Email Type Toggle: Plain Text vs HTML

### Existing editor found
The codebase already has a TipTap-based editor at `src/components/shared/RichTextEditor.tsx` (with merge-tag support). I'll reuse it for HTML mode. The current campaign form uses a plain `<Textarea>` for the body.

### Changes

**1. DB migration**
- `ALTER TABLE campaigns ADD COLUMN email_type TEXT NOT NULL DEFAULT 'plain' CHECK (email_type IN ('plain','html'));`
- Backfill: `UPDATE campaigns SET email_type='plain' WHERE email_type IS NULL;` (covered by NOT NULL DEFAULT, but explicit update included).
- Also add to `sequence_steps` / `campaign_sequences`? **Out of scope** — only campaigns table per spec. Sequence steps will inherit the parent campaign's `email_type` at send time.

**2. Campaign form (`src/pages/Campaigns.tsx`)**
- Add `email_type: 'plain' | 'html'` to form state (default `'plain'`).
- Add a `ToggleGroup` (Plain Text / HTML / Designed) at the top of the body section.
- Plain mode: existing `<Textarea>` + muted hint *"Plain text emails have higher deliverability for cold outreach. Line breaks are preserved."*
- HTML mode: `<RichTextEditor>` + muted hint *"Use HTML mode for newsletters or designed emails. Not recommended for cold outreach."*
- Mode-switch handling:
  - Plain → HTML: auto-wrap each line in `<p>` (blank lines → `<br>`), no confirm.
  - HTML → Plain: `window.confirm("Switching to plain text will remove all HTML formatting. Continue?")`; on confirm, strip tags via the existing `htmlToText`-equivalent (small inline helper on the client).
- For sequence steps (the `steps[]` array in the same form), keep them tied to the campaign's `email_type` (one toggle controls all steps in this campaign). No per-step toggle.
- Insert payload includes `email_type`.

**3. Campaign list/detail**
- Add a small muted badge next to each campaign's name on the cards: `PLAIN` or `HTML`.

**4. Send logic (`supabase/functions/send-campaign/index.ts` and `process-sequences/index.ts`)**
- Read `campaign.email_type`. 
  - `plain`: `client.send({ from, to, subject, content: body + trackingPixelTextNote })` — note: the tracking pixel is HTML-only, so in plain mode we **omit the tracking pixel** (open tracking won't work for plain text, which is expected for cold outreach). Document this in the hint? The spec says "what the user types is exactly what gets sent" so we skip the pixel entirely in plain mode.
  - `html`: current behavior — `content: htmlToText(body)`, `html: body + trackingPixel`.
- Use existing `htmlToText` from `_shared/smtp-helpers.ts` (the spec calls it `stripHtml`; we'll reuse `htmlToText` which already exists).

**5. Out of scope**
- SMTP infra, warmup, auth, anything else.

### Files touched
- migration (new)
- `src/pages/Campaigns.tsx`
- `supabase/functions/send-campaign/index.ts`
- `supabase/functions/process-sequences/index.ts`

### Note on tracking pixel in plain mode
Per spec, plain mode sends exactly what the user typed with no HTML wrapping — so the 1×1 tracking pixel is dropped for plain emails (open tracking only works in HTML). Confirm this is acceptable; if you'd rather keep open tracking, we'd need to send plain campaigns as multipart with an HTML alt part (which contradicts "no HTML wrapping").

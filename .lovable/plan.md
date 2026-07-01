## Goal

Two small UX improvements around signatures on the Campaigns composer:

1. Make it obvious **where** to configure a signature (right now the hint just says "signature will be appended" with no pointer).
2. Show a **live preview** of the actual signature that will be appended, rendered exactly as the recipient will see it (HTML for HTML campaigns, plain for Plain campaigns).

No changes to sending logic, no schema changes — this is purely presentation in `src/pages/Campaigns.tsx`.

## What changes

### 1. Signature source clarity
Replace the current one-line hint under the body editor with a small info block:

- Line 1: "Signature will be appended from the selected sending account."
- Line 2: a link/button "Manage signatures in Accounts →" that navigates to `/accounts` (opens in same tab, since Campaigns dialog can be reopened).
- If **no sending account is selected yet** (or the campaign has no account attached), show: "Select a sending account to preview its signature." instead of the preview.
- If the selected account has **no signature configured** for the current `email_type`, show: "This account has no {Plain|HTML} signature. Add one in Accounts." with the same link.

### 2. Live signature preview
Under the body editor, add a collapsible "Signature preview" section:

- Fetch the selected sending account's `signature_html` and `signature_plain` from `email_accounts` (already loaded on Campaigns page — reuse existing accounts state; no extra query needed).
- Render based on `email_type`:
  - **HTML mode** → render `signature_html` inside a sandboxed preview box (`div` with `prose prose-invert` styling and `dangerouslySetInnerHTML`, wrapped in a bordered muted card so it visually reads as "appended below your body").
  - **Plain mode** → render `signature_plain` inside a `<pre>` with `whitespace-pre-wrap` and monospace styling.
- Substitute merge tags with sample values for the preview only (`{{first_name}}` → "Alex", `{{name}}` → "Alex Rivera", `{{company}}` → "Acme", `{{email}}` → the account email). This matches how the actual send substitutes, so the preview is faithful.
- Small header row: "Signature preview" + muted subtext "This will be appended after your email body."
- Collapsed by default (`<details>` element, or a simple show/hide toggle) so it doesn't crowd the composer.

### 3. Empty-state affordance in Accounts (tiny)
No functional change, just make the discovery path obvious the other direction too: in `src/pages/Accounts.tsx`, when an account has neither `signature_html` nor `signature_plain` set, show a subtle "No signature yet" pill on the account card so users can spot which accounts need one configured. (Skip if this would require restructuring the card — only add if the card already renders per-account meta chips.)

## Files touched

- `src/pages/Campaigns.tsx` — replace signature hint with info block + live preview.
- `src/pages/Accounts.tsx` — optional "No signature yet" pill (only if card structure allows a one-line addition).

## Not changing

- `send-campaign`, `process-sequences`, `send-reply` — signature append logic stays as-is.
- Signature storage schema.
- The Accounts signature editor UI itself.

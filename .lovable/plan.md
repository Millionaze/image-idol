

# Switch AI from Lovable Gateway to Claude (Anthropic)

## Secret Setup
Store `ANTHROPIC_API_KEY` as a Supabase secret with the provided key value. Remove dependency on `LOVABLE_API_KEY` for AI calls.

## Edge Function Changes

### 1. `supabase/functions/generate-email-copy/index.ts`
- Replace `ai.gateway.lovable.dev` with `https://api.anthropic.com/v1/messages`
- Switch from OpenAI-compatible format to Anthropic Messages API format
- Use `ANTHROPIC_API_KEY` via `x-api-key` header
- Model: `claude-sonnet-4-20250514`
- Adapt request/response parsing (Anthropic uses `content[0].text` instead of `choices[0].message.content`)

### 2. `supabase/functions/generate-warmup-content/index.ts`
- Same API switch for both subject and body generation calls
- Replace `LOVABLE_API_KEY` with `ANTHROPIC_API_KEY`
- Adapt to Anthropic Messages API format (system prompt goes in `system` field, not as a message)

### API Format Change
```text
Before (OpenAI-compatible):
  POST ai.gateway.lovable.dev/v1/chat/completions
  Authorization: Bearer $KEY
  { model, messages: [{role,content}...] }
  → choices[0].message.content

After (Anthropic native):
  POST api.anthropic.com/v1/messages
  x-api-key: $KEY
  anthropic-version: 2023-06-01
  { model, system, messages: [{role,content}...], max_tokens }
  → content[0].text
```

No UI changes needed.


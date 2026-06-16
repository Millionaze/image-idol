
# Fix: stuck campaigns + sent_count discrepancy

## What's wrong

`send-campaign` writes per-contact status inside the loop but only writes the campaign aggregate (`sent_count`, `bounce_count`, `status='active'`) **once, after the loop ends**. If the edge function dies during the loop — almost always because `denomailer.client.send()` hangs on a slow/dead MX — those aggregates and the status flip are lost. Result: dashboard says `0 sent / sending` while contacts table says `3 sent`. This is exactly what happened to **Outreach 2** (3 contacts sent at 19:07, `contact@consultevo.com` still pending, campaign stuck at `status='sending'`).

## Fixes

### 1. Per-send timeout in `send-campaign`
Wrap each `client.send(...)` in a `Promise.race` with a 25s timeout. On timeout, throw → caught by existing per-contact catch → treated as `transient` (contact stays `pending`, retried next run). This prevents a single bad domain from killing the whole batch.

### 2. Incremental campaign counter updates
Move the `campaigns.sent_count` / `bounce_count` increment from the post-loop block to *inside* the per-contact try/catch — increment after each successful send (and after each bounce). Final post-loop update only flips `status='active'`. Even if the function is killed mid-loop, the campaign row always reflects what actually happened.

Use a single RPC-style update via `update({ sent_count: <new>, ... })` computed from the in-memory `campaign.sent_count + sentCount` running total — same pattern as today, just executed after each send instead of once at the end. (We accept the very small race window of two concurrent runs since `send-campaign` is invoked manually per campaign.)

### 3. Always-finalize via `try/finally`
Wrap the loop in `try { ... } finally { /* flip status='active' and persist counters */ }`. If the function still gets killed beyond CPU budget, at least every committed contact will have already updated the campaign counter (from fix #2).

### 4. Fix the `req.clone().json()` bug (line 78)
`req.json()` was already consumed on line 42. Capture the parsed body once at the top into `const body = await req.json()` and read `body.force_send` / `body.campaign_id` from it. No behavior change for normal sends; fixes the warmup-override path.

### 5. One-time reconciliation of Outreach 2
Run a single data update via the insert tool:
```sql
UPDATE public.campaigns c
SET sent_count = sub.sent,
    bounce_count = sub.bounced,
    status = CASE WHEN sub.pending = 0 THEN 'active' ELSE 'sending' END
FROM (
  SELECT campaign_id,
         count(*) FILTER (WHERE status='sent')    AS sent,
         count(*) FILTER (WHERE status='bounced') AS bounced,
         count(*) FILTER (WHERE status='pending') AS pending
  FROM public.contacts GROUP BY campaign_id
) sub
WHERE c.id = sub.campaign_id
  AND (c.sent_count <> sub.sent OR c.bounce_count <> sub.bounced);
```
This fixes Outreach 2 immediately and also corrects any other historical drift.

### 6. (Optional, recommended) Re-trigger pending contacts
After fix #5, Outreach 2 will show `3 sent` and 1 pending. The user can hit "Send" again to retry `consultevo.com` (or let the existing `process-sequences` cron pick it up if sequences are configured). I'll add a one-line note in the response, not a code change.

## Out of scope

- No change to plain/HTML send paths, tracking pixel, warmup gate logic, or `process-sequences`.
- No change to the contacts or campaigns schema.
- No change to UI.

## Files touched

- **Edit** `supabase/functions/send-campaign/index.ts` — fixes #1, #2, #3, #4.
- **Run** the reconciliation `UPDATE` via the `supabase--insert` tool — fix #5.

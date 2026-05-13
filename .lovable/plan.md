## Plan: Remove unused Recent Warmup data fetching

After the Recent Warmup card was removed, `warmupLogs` state and its query are no longer used. Clean up:

### `src/pages/Dashboard.tsx`
1. Remove `warmupLogs` state (line 17) and `setWarmupLogs(...)` (line 43).
2. Remove the unused `warmup_logs` fetch from the `Promise.all` (line 29) and drop `logsRes` from the destructure. Keep the chart's separate `warmup_logs` query (lines 58–62) since it powers the 7-Day Activity chart.

### Out of scope
No other warmup logic (chart, stats, weakest account, edge functions, tables) is touched.

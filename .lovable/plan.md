## Goal
Hide the "Recent Warmup" panel on the Dashboard (the list of warmup partner emails with green Success badges).

## Changes
- **`src/pages/Dashboard.tsx`** (lines 184–203): Delete the `<Card>` containing "Recent Warmup".
- Update the surrounding grid (line 148) from `lg:grid-cols-3` to `lg:grid-cols-1` and remove `lg:col-span-2` from the 7-Day Warmup Activity card so it spans the full width cleanly now that its sibling is gone.

## Out of scope
- No changes to warmup logic, data fetching, or other dashboard widgets.
- The underlying `warmupLogs` query stays (still used for stats); only the visual panel is removed.

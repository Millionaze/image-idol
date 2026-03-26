

# Unibox Auto-Sync & Accounts IMAP Fields

## Current State
- The Accounts page **already has** IMAP Host and IMAP Port fields in the add account form (lines 197-200) and saves them to the database. No changes needed there.
- The Unibox page has a manual "Sync All" button that calls the `inbox-sync` edge function for each account.
- There is no auto-sync interval.

## Changes

### 1. Add Auto-Sync Interval to Unibox (`src/pages/Unibox.tsx`)
- Add a `useEffect` that runs `syncAll` automatically every 2 minutes after initial load
- Use `setInterval` with cleanup on unmount
- Show a subtle "Last synced: X ago" indicator near the Sync button
- Skip auto-sync if a manual sync is already in progress

### 2. Show IMAP Info on Account Cards (`src/pages/Accounts.tsx`)
- Add IMAP host:port display alongside the existing SMTP info line (line 275-276) so users can verify IMAP is configured

## Files Changed
| File | Change |
|------|--------|
| `src/pages/Unibox.tsx` | Add auto-sync interval (every 2 min) + last synced timestamp |
| `src/pages/Accounts.tsx` | Show IMAP host:port on account cards |


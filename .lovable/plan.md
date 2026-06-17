## Why inbox emails are not being received

The latest backend logs show the inbox sync is starting for many accounts at the same time and then getting killed with **CPU Time exceeded**. When that happens, the sync can stop before messages are fetched and saved, so the Inbox page has nothing new to display.

There was also an older insert conflict, but the needed unique indexes now exist, so the main active blocker is the sync timeout/concurrency behavior.

## Plan

1. **Limit batch inbox sync concurrency**
   - Change the `fetch_all` mode so it does not sync every account simultaneously.
   - Process accounts in small batches or sequentially with a strict overall time budget.
   - This prevents Supabase from killing the function before it can finish saving messages.

2. **Make each account sync cheaper**
   - Reduce the number of messages fetched per scheduled account run.
   - Keep manual single-account sync more useful, but still bounded.
   - Skip or fail fast on accounts that do not have usable IMAP credentials.

3. **Improve timeout handling**
   - Log which accounts timed out, authenticated failed, or synced successfully.
   - Return a partial success response instead of letting one slow account ruin the whole batch.

4. **Preserve hybrid SMTP/IMAP credential support**
   - Keep using IMAP-specific username/password first.
   - Fall back to SMTP credentials only for older accounts that have not enabled separate IMAP credentials.

5. **Verify with backend logs**
   - After implementation, deploy/check the function and confirm the `CPU Time exceeded` pattern is gone.
   - The user action after this remains: for GoDaddy/Brevo hybrid accounts, edit the account and enter the real IMAP mailbox credentials under the separate IMAP fields.
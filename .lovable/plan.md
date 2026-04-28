## Add Edit button to email account cards

### Changes (single file: `src/pages/Accounts.tsx`)

**1. New state for the edit dialog**
- `editAccount` (the account being edited, or `null`)
- `editForm` for the editable fields (`name`, `email`, `username`, `password`, plus host/port for completeness)
- `editSaving` and `editError` for save state and inline errors

**2. New `Pencil` icon import** from `lucide-react`.

**3. New "Edit" icon button on each account card**, placed next to the existing trash button. Clicking it opens the edit dialog pre-filled with the account's values (password field starts empty).

**4. New Edit Dialog** (mirrors the Add Account dialog) with fields:
- Display Name
- Email Address (auto-mirrors Username when Username matches the old email — same UX as Add)
- IMAP / SMTP host & port (so users can fix server settings too)
- Username (with the same helper text and inline mismatch warning we just added)
- Password — placeholder "Leave blank to keep current password"

**5. Save behavior**
- Build an update payload from the form. **Only include `password` if the user typed a new one** (so we don't wipe the saved password by accident).
- If `username` differs from `email`, show the same `window.confirm` guardrail we added to the Add flow.
- If `username` or `password` changed, also reset `last_synced_uid = 0` so the next IMAP sync starts fresh against the (possibly different) mailbox and we don't end up with stale UIDs.
- `UPDATE email_accounts SET ... WHERE id = editAccount.id` via the Supabase client (RLS already restricts to the user's own rows).
- Toast on success/failure, close the dialog, and `load()` to refresh.

### Notes
- No DB schema changes; `email_accounts` already has all the columns.
- We deliberately do NOT pre-fill the password input — passwords in the DB are stored as-is and re-displaying them is unnecessary and risky.
- We keep the existing Add flow untouched.

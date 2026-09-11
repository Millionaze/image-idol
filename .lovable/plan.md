# Fix sign-in “Failed to fetch”

## Confirmed cause
The browser is repeatedly sending a saved-session refresh request to Supabase, and Supabase returns `504 upstream request timeout`. The password sign-in request never starts, so the current stale-session recovery does not cover this failure.

## Changes
1. Extend session recovery to recognize refresh timeouts and network failures, not only malformed JWT errors.
2. Clear the unusable local Supabase session when initial validation or refresh fails, preventing repeated refresh loops.
3. Make password sign-in recover from a blocked stale session: clear it, then retry the password request once with the credentials the user just submitted.
4. Keep genuine credential errors unchanged, so incorrect email/password messages are not hidden or retried unnecessarily.
5. Verify that sign-in sends a password token request, reaches the dashboard on success, and no longer loops on refresh-token `504` responses.

## Scope
Only authentication session recovery and sign-in handling will change. User accounts, passwords, and application data will not be modified.

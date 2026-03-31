

# Disable Email Confirmation Requirement

## What's happening
Supabase requires email confirmation by default. The user `bellefontainec@gmail.com` signed up but never clicked the confirmation link, so login is blocked with "Email not confirmed."

## Fix
Disable the "Confirm email" setting in the Supabase Auth dashboard. This is a Supabase project setting, not a code change.

**Steps:**
1. Go to [Supabase Auth Providers](https://supabase.com/dashboard/project/ivyqkprlrosapkmmwkeh/auth/providers)
2. Under **Email** provider settings, toggle off **"Confirm email"**
3. Save

This lets users log in immediately after signup. The existing unconfirmed user (`bellefontainec@gmail.com`) will also be able to log in right away.

No code changes are needed.


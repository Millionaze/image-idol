ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS signature_html text,
  ADD COLUMN IF NOT EXISTS signature_plain text;
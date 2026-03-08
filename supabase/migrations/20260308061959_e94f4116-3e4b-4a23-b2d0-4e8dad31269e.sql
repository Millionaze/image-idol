
-- Fix trigger (drop if exists, recreate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Drop all RESTRICTIVE RLS policies and recreate as PERMISSIVE

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- email_accounts
DROP POLICY IF EXISTS "Users can manage own email accounts" ON public.email_accounts;
CREATE POLICY "Users can manage own email accounts" ON public.email_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- campaigns
DROP POLICY IF EXISTS "Users can manage own campaigns" ON public.campaigns;
CREATE POLICY "Users can manage own campaigns" ON public.campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- contacts
DROP POLICY IF EXISTS "Users can manage contacts of own campaigns" ON public.contacts;
CREATE POLICY "Users can manage contacts of own campaigns" ON public.contacts FOR ALL
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = contacts.campaign_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = contacts.campaign_id AND c.user_id = auth.uid()));

-- warmup_logs
DROP POLICY IF EXISTS "Users can view own warmup logs" ON public.warmup_logs;
DROP POLICY IF EXISTS "Users can insert own warmup logs" ON public.warmup_logs;
CREATE POLICY "Users can view own warmup logs" ON public.warmup_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = warmup_logs.account_id AND ea.user_id = auth.uid()));
CREATE POLICY "Users can insert own warmup logs" ON public.warmup_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = warmup_logs.account_id AND ea.user_id = auth.uid()));

-- inbox_messages
DROP POLICY IF EXISTS "Users can manage own inbox messages" ON public.inbox_messages;
CREATE POLICY "Users can manage own inbox messages" ON public.inbox_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = inbox_messages.account_id AND ea.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM email_accounts ea WHERE ea.id = inbox_messages.account_id AND ea.user_id = auth.uid()));

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

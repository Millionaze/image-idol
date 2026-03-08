
-- Contact lists table
CREATE TABLE public.contact_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact lists"
  ON public.contact_lists FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- List contacts table
CREATE TABLE public.list_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text,
  company text,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(list_id, email)
);

ALTER TABLE public.list_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own list contacts"
  ON public.list_contacts FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contact_lists cl
    WHERE cl.id = list_contacts.list_id AND cl.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.contact_lists cl
    WHERE cl.id = list_contacts.list_id AND cl.user_id = auth.uid()
  ));

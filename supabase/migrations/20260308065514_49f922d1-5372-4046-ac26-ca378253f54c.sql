
-- Placement tests table
CREATE TABLE public.placement_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.email_accounts(id) ON DELETE CASCADE NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.placement_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own placement tests"
  ON public.placement_tests FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Placement results table
CREATE TABLE public.placement_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid REFERENCES public.placement_tests(id) ON DELETE CASCADE NOT NULL,
  provider text NOT NULL,
  seed_email text NOT NULL,
  result text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.placement_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own placement results"
  ON public.placement_results FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.placement_tests pt
    WHERE pt.id = placement_results.test_id AND pt.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.placement_tests pt
    WHERE pt.id = placement_results.test_id AND pt.user_id = auth.uid()
  ));

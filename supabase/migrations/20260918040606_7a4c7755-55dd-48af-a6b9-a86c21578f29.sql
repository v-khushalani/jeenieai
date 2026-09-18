-- Guided Solve walkthroughs
CREATE TABLE public.question_walkthroughs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  steps JSONB NOT NULL,
  model TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX question_walkthroughs_question_id_key
  ON public.question_walkthroughs (question_id);

GRANT SELECT ON public.question_walkthroughs TO authenticated;
GRANT ALL ON public.question_walkthroughs TO service_role;

ALTER TABLE public.question_walkthroughs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Walkthroughs readable by signed-in users"
  ON public.question_walkthroughs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage walkthroughs"
  ON public.question_walkthroughs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_question_walkthroughs_updated_at
  BEFORE UPDATE ON public.question_walkthroughs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7-day full-Pro trial on signup
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
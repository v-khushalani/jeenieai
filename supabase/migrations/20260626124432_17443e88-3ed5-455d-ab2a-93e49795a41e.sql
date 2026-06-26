
CREATE TABLE public.study_plan_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_date DATE NOT NULL,
  task_hash TEXT NOT NULL,
  task_label TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date, task_hash)
);

CREATE INDEX idx_spp_user_date ON public.study_plan_progress (user_id, plan_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_progress TO authenticated;
GRANT ALL ON public.study_plan_progress TO service_role;

ALTER TABLE public.study_plan_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own plan progress"
  ON public.study_plan_progress
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

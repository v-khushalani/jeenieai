
-- 1. Extend profiles with prep_mode + daily study minutes
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prep_mode text NOT NULL DEFAULT 'guided'
    CHECK (prep_mode IN ('guided','companion','dropper','hybrid')),
  ADD COLUMN IF NOT EXISTS daily_study_minutes integer NOT NULL DEFAULT 120
    CHECK (daily_study_minutes BETWEEN 30 AND 480),
  ADD COLUMN IF NOT EXISTS prep_mode_set_at timestamptz;

-- 2. daily_missions table
CREATE TABLE IF NOT EXISTS public.daily_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  prep_mode text NOT NULL,
  total_minutes integer NOT NULL,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasoning text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  completed_blocks integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_missions TO authenticated;
GRANT ALL ON public.daily_missions TO service_role;
ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own missions" ON public.daily_missions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_missions_user_date
  ON public.daily_missions (user_id, mission_date DESC);

-- 3. class_logs table (Companion mode)
CREATE TABLE IF NOT EXISTS public.class_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  subject text NOT NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  chapter_name text,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  topic_name text,
  source text NOT NULL DEFAULT 'coaching'
    CHECK (source IN ('coaching','school','youtube','self','other')),
  notes text,
  recap_test_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_logs TO authenticated;
GRANT ALL ON public.class_logs TO service_role;
ALTER TABLE public.class_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own class logs" ON public.class_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_class_logs_user_date
  ON public.class_logs (user_id, logged_date DESC);

-- 4. updated_at trigger for daily_missions
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_daily_missions_updated_at ON public.daily_missions;
CREATE TRIGGER trg_daily_missions_updated_at
  BEFORE UPDATE ON public.daily_missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

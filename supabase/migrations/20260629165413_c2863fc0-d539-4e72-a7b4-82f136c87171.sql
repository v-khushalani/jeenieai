
DO $$ BEGIN
  CREATE TYPE public.roadmap_milestone AS ENUM ('learn', 'drill', 'review', 'test');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.roadmap_status AS ENUM ('pending', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.study_plan_progress
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS milestone public.roadmap_milestone,
  ADD COLUMN IF NOT EXISTS status public.roadmap_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS progress_current integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_target integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS study_plan_progress_user_chapter_milestone_idx
  ON public.study_plan_progress(user_id, chapter_id, milestone)
  WHERE chapter_id IS NOT NULL AND milestone IS NOT NULL;

CREATE INDEX IF NOT EXISTS study_plan_progress_user_status_idx
  ON public.study_plan_progress(user_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_progress TO authenticated;
GRANT ALL ON public.study_plan_progress TO service_role;

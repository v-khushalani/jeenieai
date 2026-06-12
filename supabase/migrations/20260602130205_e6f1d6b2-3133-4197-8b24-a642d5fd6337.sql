
-- 1) Generic updated_at function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) Attach updated_at triggers to all editable content tables
DROP TRIGGER IF EXISTS trg_chapters_updated_at ON public.chapters;
CREATE TRIGGER trg_chapters_updated_at BEFORE UPDATE ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_topics_updated_at ON public.topics;
CREATE TRIGGER trg_topics_updated_at BEFORE UPDATE ON public.topics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_batches_updated_at ON public.batches;
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_questions_updated_at ON public.questions;
CREATE TRIGGER trg_questions_updated_at BEFORE UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Add offer_price column to batches (admin UI already references it)
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS offer_price NUMERIC;

-- 4) Seed canonical subjects so chapters can resolve subject_id FK
INSERT INTO public.subjects (name, code, display_order, is_active) VALUES
  ('Physics', 'Physics', 1, true),
  ('Chemistry', 'Chemistry', 2, true),
  ('Mathematics', 'Mathematics', 3, true),
  ('Biology', 'Biology', 4, true),
  ('Science', 'Science', 5, true),
  ('English', 'English', 6, true),
  ('Mental Ability', 'Mental Ability', 7, true)
ON CONFLICT DO NOTHING;

-- 5) Backfill chapters.subject_id from name match (idempotent)
UPDATE public.chapters c
SET subject_id = s.id
FROM public.subjects s
WHERE c.subject_id IS NULL
  AND c.subject IS NOT NULL
  AND LOWER(s.name) = LOWER(c.subject);


-- 1) Seed foundational subjects (idempotent)
INSERT INTO public.subjects (name, code, display_order, is_active) VALUES
  ('Physics', 'PHYSICS', 1, true),
  ('Chemistry', 'CHEMISTRY', 2, true),
  ('Mathematics', 'MATHEMATICS', 3, true),
  ('Biology', 'BIOLOGY', 4, true)
ON CONFLICT DO NOTHING;

-- Add a unique on code so future upserts are safe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'subjects_code_unique') THEN
    CREATE UNIQUE INDEX subjects_code_unique ON public.subjects(code);
  END IF;
END $$;

-- 2) Seed foundational batches (idempotent)
INSERT INTO public.batches (name, slug, exam_type, grade, is_active, is_free, display_order) VALUES
  ('JEE Class 11', 'jee-11', 'JEE', 11, true, false, 1),
  ('JEE Class 12', 'jee-12', 'JEE', 12, true, false, 2),
  ('NEET Class 11', 'neet-11', 'NEET', 11, true, false, 3),
  ('NEET Class 12', 'neet-12', 'NEET', 12, true, false, 4),
  ('Foundation Class 9', 'foundation-9', 'Foundation', 9, true, true, 5),
  ('Foundation Class 10', 'foundation-10', 'Foundation', 10, true, true, 6)
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'batches_slug_unique') THEN
    CREATE UNIQUE INDEX batches_slug_unique ON public.batches(slug);
  END IF;
END $$;

-- 3) Ensure chapters has the unique slug index the importer relies on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'chapters_slug_unique') THEN
    CREATE UNIQUE INDEX chapters_slug_unique ON public.chapters(slug) WHERE slug IS NOT NULL;
  END IF;
END $$;

-- 4) Ensure questions.content_hash is unique (importer relies on it for dedup upsert)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'questions_content_hash_unique') THEN
    CREATE UNIQUE INDEX questions_content_hash_unique ON public.questions(content_hash) WHERE content_hash IS NOT NULL;
  END IF;
END $$;

-- 5) Backfill: keep legacy `question` column in sync with `question_text`
UPDATE public.questions
SET question = question_text
WHERE question IS NULL AND question_text IS NOT NULL;

-- 6) Trigger to keep both columns in sync going forward (one source of truth, both populated)
CREATE OR REPLACE FUNCTION public.sync_question_text_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.question IS NULL AND NEW.question_text IS NOT NULL THEN
    NEW.question := NEW.question_text;
  ELSIF NEW.question_text IS NULL AND NEW.question IS NOT NULL THEN
    NEW.question_text := NEW.question;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_question_text ON public.questions;
CREATE TRIGGER trg_sync_question_text
BEFORE INSERT OR UPDATE OF question, question_text ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.sync_question_text_columns();

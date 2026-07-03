
-- Add class_level to questions (denormalized from chapters)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS class_level smallint;

-- Backfill from linked chapter
UPDATE public.questions q
SET class_level = c.class_level
FROM public.chapters c
WHERE q.chapter_id = c.id
  AND q.class_level IS DISTINCT FROM c.class_level;

-- Keep in sync on insert / chapter change
CREATE OR REPLACE FUNCTION public.questions_sync_class_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.chapter_id IS NOT NULL THEN
    SELECT class_level INTO NEW.class_level
    FROM public.chapters
    WHERE id = NEW.chapter_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS questions_sync_class_level_trg ON public.questions;
CREATE TRIGGER questions_sync_class_level_trg
BEFORE INSERT OR UPDATE OF chapter_id ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.questions_sync_class_level();

-- When a chapter's class_level changes, propagate to its questions
CREATE OR REPLACE FUNCTION public.chapters_propagate_class_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.class_level IS DISTINCT FROM OLD.class_level THEN
    UPDATE public.questions SET class_level = NEW.class_level WHERE chapter_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chapters_propagate_class_level_trg ON public.chapters;
CREATE TRIGGER chapters_propagate_class_level_trg
AFTER UPDATE OF class_level ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.chapters_propagate_class_level();

-- Index for grade-scoped queries
CREATE INDEX IF NOT EXISTS idx_questions_class_subject_chapter
  ON public.questions (class_level, subject, chapter_id)
  WHERE is_active = true;

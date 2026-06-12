
-- ============================================================
-- PHASE 1: COMPLETE WIPE + INTEGRITY LOCK
-- ============================================================

-- Drop dependent foreign-key constraints temporarily by truncating in correct order
TRUNCATE TABLE
  public.question_attempts,
  public.question_reports,
  public.question_chapter_remap,
  public.extracted_questions_queue,
  public.topic_mastery,
  public.test_sessions,
  public.questions,
  public.topics,
  public.chapters
RESTART IDENTITY CASCADE;

-- Drop old AI-remap staging table (not needed anymore)
DROP TABLE IF EXISTS public.question_chapter_remap CASCADE;

-- ============================================================
-- INTEGRITY LOCK: enforce source + chapter on every future row
-- ============================================================

-- Add validation trigger (CHECK constraints can't be deferred and break future imports)
CREATE OR REPLACE FUNCTION public.enforce_question_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS NULL OR length(trim(NEW.source)) = 0 THEN
    RAISE EXCEPTION 'questions.source is required (no untagged imports allowed)';
  END IF;
  IF NEW.chapter_id IS NULL THEN
    RAISE EXCEPTION 'questions.chapter_id is required (no orphan questions allowed)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_question_integrity ON public.questions;
CREATE TRIGGER trg_enforce_question_integrity
BEFORE INSERT OR UPDATE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_question_integrity();

-- Helpful indexes for the import + query workload
CREATE INDEX IF NOT EXISTS idx_questions_source ON public.questions(source);
CREATE INDEX IF NOT EXISTS idx_questions_chapter_id ON public.questions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic_id ON public.questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_chapters_subject_id_name ON public.chapters(subject_id, name);
CREATE INDEX IF NOT EXISTS idx_topics_chapter_id_name ON public.topics(chapter_id, name);

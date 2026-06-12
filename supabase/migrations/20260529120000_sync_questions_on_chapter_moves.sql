-- Keep questions in sync when a chapter moves between grades/batches.
-- Also backfill existing mismatched rows so the current site reflects real data.

CREATE OR REPLACE FUNCTION public.sync_questions_on_chapter_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.questions
  SET
    batch_id = NEW.batch_id,
    subject = NEW.subject,
    chapter = COALESCE(NEW.chapter_name, NEW.name, chapter)
  WHERE chapter_id = NEW.id
    AND (
      batch_id IS DISTINCT FROM NEW.batch_id
      OR subject IS DISTINCT FROM NEW.subject
      OR chapter IS DISTINCT FROM COALESCE(NEW.chapter_name, NEW.name, chapter)
    );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_subject_question_counts(
  p_batch_ids uuid[] DEFAULT NULL,
  p_exam text DEFAULT NULL
) RETURNS TABLE(subject text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- Count questions grouped by subject. Prefer the chapter's subject when
  -- available, otherwise fall back to the question's `subject` column. This
  -- ensures questions that don't have a chapter_id are still counted.
  SELECT COALESCE(c.subject, q.subject) AS subject, COUNT(*)::bigint
  FROM public.questions q
  LEFT JOIN public.chapters c ON c.id = q.chapter_id
  WHERE q.is_active = true
    AND (c.id IS NULL OR c.is_active = true)
    AND COALESCE(c.subject, q.subject) IS NOT NULL
    AND (
      p_batch_ids IS NULL
      OR cardinality(p_batch_ids) = 0
      OR (q.batch_id IS NOT NULL AND q.batch_id = ANY(p_batch_ids))
      OR (c.batch_id IS NOT NULL AND c.batch_id = ANY(p_batch_ids))
      OR q.batch_id IS NULL
      OR c.batch_id IS NULL
    )
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%' AND q.exam IN ('JEE Mains','JEE Advanced'))
      OR (p_exam ILIKE '%neet%' AND q.exam = 'NEET')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND q.exam = p_exam)
    )
  GROUP BY COALESCE(c.subject, q.subject);
$$;

CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(
  p_subject text,
  p_batch_ids uuid[] DEFAULT NULL,
  p_exam text DEFAULT NULL
) RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  -- Count questions per chapter. When filtering by batch, consider both the
  -- question-level `batch_id` and the chapter's `batch_id` so questions that
  -- were assigned a batch at the question level are not excluded.
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  JOIN public.chapters c ON c.id = q.chapter_id
  WHERE q.is_active = true
    AND c.is_active = true
    AND q.chapter_id IS NOT NULL
    AND c.subject ILIKE p_subject
    AND (
      p_batch_ids IS NULL
      OR cardinality(p_batch_ids) = 0
      OR (q.batch_id IS NOT NULL AND q.batch_id = ANY(p_batch_ids))
      OR (c.batch_id IS NOT NULL AND c.batch_id = ANY(p_batch_ids))
      OR q.batch_id IS NULL
      OR c.batch_id IS NULL
    )
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%' AND q.exam IN ('JEE Mains','JEE Advanced'))
      OR (p_exam ILIKE '%neet%' AND q.exam = 'NEET')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND q.exam = p_exam)
    )
  GROUP BY q.chapter_id;
$$;

DROP TRIGGER IF EXISTS trg_sync_questions_on_chapter_update ON public.chapters;
CREATE TRIGGER trg_sync_questions_on_chapter_update
AFTER UPDATE OF batch_id, class_level, subject, chapter_name, name ON public.chapters
FOR EACH ROW
EXECUTE FUNCTION public.sync_questions_on_chapter_update();

-- Backfill existing data so previously moved chapters are reflected immediately.
UPDATE public.questions q
SET
  batch_id = c.batch_id,
  subject = c.subject,
  chapter = COALESCE(c.chapter_name, c.name, q.chapter)
FROM public.chapters c
WHERE q.chapter_id = c.id
  AND (
    q.batch_id IS DISTINCT FROM c.batch_id
    OR q.subject IS DISTINCT FROM c.subject
    OR q.chapter IS DISTINCT FROM COALESCE(c.chapter_name, c.name, q.chapter)
  );

-- Fix RPC counts so Study Now does not leak class 12 totals into class 11.
-- The user's batch ids identify the grade scope; this keeps counts aligned to
-- the selected grade while still honoring batch-specific assignments.

CREATE OR REPLACE FUNCTION public.get_subject_question_counts(
  p_batch_ids uuid[] DEFAULT NULL,
  p_exam text DEFAULT NULL
) RETURNS TABLE(subject text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH batch_scope AS (
    SELECT DISTINCT b.grade
    FROM public.batches b
    WHERE p_batch_ids IS NOT NULL
      AND cardinality(p_batch_ids) > 0
      AND b.id = ANY(p_batch_ids)
  )
  SELECT COALESCE(c.subject, q.subject) AS subject, COUNT(*)::bigint
  FROM public.questions q
  LEFT JOIN public.chapters c ON c.id = q.chapter_id
  WHERE q.is_active = true
    AND (c.id IS NULL OR c.is_active = true)
    AND COALESCE(c.subject, q.subject) IS NOT NULL
    AND (
      p_batch_ids IS NULL
      OR cardinality(p_batch_ids) = 0
      OR q.batch_id = ANY(p_batch_ids)
      OR c.batch_id = ANY(p_batch_ids)
      OR c.class_level IN (SELECT grade FROM batch_scope)
    )
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%' AND q.exam IN ('JEE Mains', 'JEE Advanced'))
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH batch_scope AS (
    SELECT DISTINCT b.grade
    FROM public.batches b
    WHERE p_batch_ids IS NOT NULL
      AND cardinality(p_batch_ids) > 0
      AND b.id = ANY(p_batch_ids)
  )
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
      OR q.batch_id = ANY(p_batch_ids)
      OR c.batch_id = ANY(p_batch_ids)
      OR c.class_level IN (SELECT grade FROM batch_scope)
    )
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%' AND q.exam IN ('JEE Mains', 'JEE Advanced'))
      OR (p_exam ILIKE '%neet%' AND q.exam = 'NEET')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND q.exam = p_exam)
    )
  GROUP BY q.chapter_id;
$$;
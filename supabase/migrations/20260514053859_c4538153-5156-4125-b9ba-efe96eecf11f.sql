CREATE OR REPLACE FUNCTION public.get_subject_question_counts(
  p_batch_ids uuid[] DEFAULT NULL,
  p_exam text DEFAULT NULL
) RETURNS TABLE(subject text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT subject, COUNT(*)::bigint
  FROM questions
  WHERE is_active = true
    AND subject IS NOT NULL
    AND (p_batch_ids IS NULL OR cardinality(p_batch_ids)=0 OR batch_id = ANY(p_batch_ids) OR batch_id IS NULL)
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%' AND exam ILIKE '%jee%')
      OR (p_exam ILIKE '%neet%' AND exam ILIKE '%neet%')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND exam = p_exam)
    )
  GROUP BY subject;
$$;

CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(
  p_subject text,
  p_batch_ids uuid[] DEFAULT NULL,
  p_exam text DEFAULT NULL
) RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT chapter_id, COUNT(*)::bigint
  FROM questions
  WHERE is_active = true
    AND chapter_id IS NOT NULL
    AND subject ILIKE p_subject
    AND (p_batch_ids IS NULL OR cardinality(p_batch_ids)=0 OR batch_id = ANY(p_batch_ids) OR batch_id IS NULL)
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%' AND exam ILIKE '%jee%')
      OR (p_exam ILIKE '%neet%' AND exam ILIKE '%neet%')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND exam = p_exam)
    )
  GROUP BY chapter_id;
$$;
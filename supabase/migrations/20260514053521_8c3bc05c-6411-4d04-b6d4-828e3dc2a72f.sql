-- Server-side question count aggregations to fix 1000-row truncation in Study/Test pages

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
      OR (p_exam ILIKE '%jee%' AND exam IN ('JEE Mains','JEE Advanced'))
      OR (p_exam ILIKE '%neet%' AND exam = 'NEET')
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
      OR (p_exam ILIKE '%jee%' AND exam IN ('JEE Mains','JEE Advanced'))
      OR (p_exam ILIKE '%neet%' AND exam = 'NEET')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND exam = p_exam)
    )
  GROUP BY chapter_id;
$$;

CREATE OR REPLACE FUNCTION public.get_topic_question_counts(
  p_chapter_id uuid
) RETURNS TABLE(topic_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT topic_id, COUNT(*)::bigint
  FROM questions
  WHERE is_active = true AND chapter_id = p_chapter_id AND topic_id IS NOT NULL
  GROUP BY topic_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[], text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(text, uuid[], text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_topic_question_counts(uuid) TO authenticated, anon;
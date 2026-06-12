
CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(
  p_chapter_ids uuid[],
  p_exam text DEFAULT NULL
)
RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  WHERE q.is_active = true
    AND q.chapter_id = ANY(p_chapter_ids)
    AND (
      p_exam IS NULL
      OR (p_exam = 'NEET' AND q.exam = 'NEET')
      OR (p_exam = 'JEE' AND q.exam IN ('JEE','JEE Main','JEE Mains','JEE Advanced'))
      OR (p_exam NOT IN ('NEET','JEE') AND q.exam = p_exam)
    )
  GROUP BY q.chapter_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) TO anon, authenticated, service_role;

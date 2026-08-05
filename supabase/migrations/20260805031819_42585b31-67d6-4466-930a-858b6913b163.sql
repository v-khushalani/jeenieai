CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_chapter_ids uuid[], p_exam text DEFAULT NULL::text)
 RETURNS TABLE(chapter_id uuid, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ids AS (
    SELECT DISTINCT u.id FROM unnest(p_chapter_ids) AS u(id)
  ),
  scoped AS (
    SELECT ids.id, c.subject
    FROM ids
    LEFT JOIN public.chapters c ON c.id = ids.id
  )
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  JOIN scoped s ON s.id = q.chapter_id
  WHERE q.is_active = true
    AND (
      public.exam_family(p_exam) IS NULL
      OR q.exam = ANY(public.exam_pool(p_exam, COALESCE(s.subject, q.subject)))
    )
  GROUP BY q.chapter_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) TO authenticated;
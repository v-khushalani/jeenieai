CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_chapter_ids uuid[], p_exam text DEFAULT NULL::text)
 RETURNS TABLE(chapter_id uuid, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ids AS (
    SELECT c.id, c.subject
    FROM public.chapters c
    WHERE c.id = ANY(p_chapter_ids)
  ),
  p AS (
    SELECT public.exam_family(p_exam) AS fam,
           public.exam_pool(p_exam, 'physics') AS pool_shared,
           public.exam_pool(p_exam, 'other') AS pool_other
  )
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  JOIN ids ON ids.id = q.chapter_id
  CROSS JOIN p
  WHERE q.is_active = true
    AND (
      p.fam IS NULL
      OR q.exam = ANY(
        CASE WHEN lower(COALESCE(ids.subject, '')) IN ('physics', 'chemistry')
             THEN p.pool_shared ELSE p.pool_other END
      )
    )
  GROUP BY q.chapter_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) TO authenticated;
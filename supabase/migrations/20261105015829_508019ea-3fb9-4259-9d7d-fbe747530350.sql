CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_chapter_ids uuid[], p_exam text DEFAULT NULL::text)
 RETURNS TABLE(chapter_id uuid, count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH agg AS (
    SELECT q.chapter_id AS cid, q.exam, COUNT(*)::bigint AS n
    FROM public.questions q
    WHERE q.is_active = true
      AND q.chapter_id = ANY(p_chapter_ids)
    GROUP BY q.chapter_id, q.exam
  ),
  p AS (
    SELECT public.exam_family(p_exam) AS fam,
           public.exam_pool(p_exam, 'physics') AS pool_shared,
           public.exam_pool(p_exam, 'other') AS pool_other
  )
  SELECT a.cid, SUM(a.n)::bigint
  FROM agg a
  JOIN public.chapters c ON c.id = a.cid
  CROSS JOIN p
  WHERE p.fam IS NULL
     OR a.exam = ANY(
       CASE WHEN lower(COALESCE(c.subject, '')) IN ('physics','chemistry')
            THEN p.pool_shared ELSE p.pool_other END)
  GROUP BY a.cid;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) TO authenticated;
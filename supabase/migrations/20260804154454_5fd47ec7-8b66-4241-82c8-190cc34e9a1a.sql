CREATE OR REPLACE FUNCTION public.fetch_unseen_questions(p_user_id uuid, p_exam text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_chapter_id uuid DEFAULT NULL::uuid, p_topic_id uuid DEFAULT NULL::uuid, p_topic_name text DEFAULT NULL::text, p_batch_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 100)
 RETURNS SETOF questions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH exam_family AS (
    SELECT CASE
      WHEN p_exam IS NULL THEN NULL::text[]
      WHEN p_exam ILIKE '%jee%' THEN ARRAY['JEE','JEE Main','JEE Mains','JEE Advanced']
      WHEN p_exam ILIKE '%neet%' THEN ARRAY['NEET']
      ELSE ARRAY[p_exam]
    END AS exams
  ),
  candidates AS (
    SELECT q.id, q.text_quality
    FROM public.questions q, exam_family ef
    WHERE (q.is_active IS NULL OR q.is_active = true)
      AND (ef.exams IS NULL OR q.exam = ANY(ef.exams))
      AND (
        (p_topic_id IS NOT NULL AND q.topic_id = p_topic_id)
        OR (p_topic_id IS NULL AND p_chapter_id IS NOT NULL AND q.chapter_id = p_chapter_id)
        OR (p_topic_id IS NULL AND p_chapter_id IS NULL AND p_subject IS NOT NULL AND lower(q.subject) = lower(p_subject))
        OR (p_topic_id IS NULL AND p_chapter_id IS NULL AND p_subject IS NULL)
      )
      AND (p_topic_name IS NULL OR q.topic ILIKE '%' || p_topic_name || '%')
      AND (p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL OR q.batch_id = ANY(p_batch_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.question_attempts qa
        WHERE qa.user_id = p_user_id AND qa.question_id = q.id
      )
    LIMIT 4000
  ),
  picked AS (
    SELECT id FROM candidates
    ORDER BY (CASE WHEN text_quality = 'damaged' THEN 1 ELSE 0 END), random()
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT q.* FROM public.questions q JOIN picked p ON p.id = q.id;
$function$;

CREATE OR REPLACE FUNCTION public.next_damaged_questions(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, question_text text, options jsonb, explanation text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.question_text, q.options, q.explanation
  FROM public.questions q
  WHERE q.text_quality = 'damaged' AND (q.is_active IS NULL OR q.is_active = true)
  ORDER BY q.created_at
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.next_damaged_questions(integer) FROM anon, authenticated;
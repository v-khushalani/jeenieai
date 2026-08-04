CREATE OR REPLACE FUNCTION public.fetch_unseen_questions(
  p_user_id uuid,
  p_exam text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL,
  p_topic_id uuid DEFAULT NULL,
  p_topic_name text DEFAULT NULL,
  p_batch_ids uuid[] DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT
      COALESCE(
        p_subject,
        (SELECT c.subject FROM public.chapters c WHERE c.id = p_chapter_id),
        (SELECT c2.subject FROM public.topics t JOIN public.chapters c2 ON c2.id = t.chapter_id WHERE t.id = p_topic_id)
      ) AS subj,
      (SELECT pr.grade FROM public.profiles pr WHERE pr.id = p_user_id) AS grade
  ),
  fam AS (
    SELECT public.exam_family(p_exam) AS native_exams,
           public.exam_pool(p_exam, (SELECT subj FROM scope)) AS pool_exams
  ),
  candidates AS (
    SELECT q.id, q.text_quality, q.exam
    FROM public.questions q, fam f, scope s
    WHERE (q.is_active IS NULL OR q.is_active = true)
      AND (f.pool_exams IS NULL OR q.exam = ANY(f.pool_exams))
      AND (
        (p_topic_id IS NOT NULL AND q.topic_id = p_topic_id)
        OR (p_topic_id IS NULL AND p_chapter_id IS NOT NULL AND q.chapter_id = p_chapter_id)
        OR (p_topic_id IS NULL AND p_chapter_id IS NULL AND p_subject IS NOT NULL AND lower(q.subject) = lower(p_subject))
        OR (p_topic_id IS NULL AND p_chapter_id IS NULL AND p_subject IS NULL)
      )
      -- When no chapter/topic scope is given, keep questions inside the
      -- student's own class level so juniors never get senior content.
      AND (
        p_chapter_id IS NOT NULL
        OR p_topic_id IS NOT NULL
        OR s.grade IS NULL
        OR q.class_level IS NULL
        OR q.class_level = s.grade
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
    SELECT c.id FROM candidates c, fam f
    ORDER BY
      (CASE WHEN c.text_quality = 'damaged' THEN 1 ELSE 0 END),
      (CASE WHEN f.native_exams IS NULL OR c.exam = ANY(f.native_exams) THEN 0 ELSE 1 END),
      random()
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT q.* FROM public.questions q JOIN picked p ON p.id = q.id;
$$;

REVOKE EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer) TO authenticated, service_role;
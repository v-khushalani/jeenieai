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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject text;
  v_grade integer;
  v_native text[];
  v_pool text[];
  v_scope text;
BEGIN
  v_subject := COALESCE(
    p_subject,
    (SELECT c.subject FROM public.chapters c WHERE c.id = p_chapter_id),
    (SELECT c2.subject FROM public.topics t JOIN public.chapters c2 ON c2.id = t.chapter_id WHERE t.id = p_topic_id)
  );
  SELECT pr.grade INTO v_grade FROM public.profiles pr WHERE pr.id = p_user_id;
  v_native := public.exam_family(p_exam);
  v_pool := public.exam_pool(p_exam, v_subject);

  IF p_topic_id IS NOT NULL THEN
    v_scope := 'topic';
  ELSIF p_chapter_id IS NOT NULL THEN
    v_scope := 'chapter';
  ELSIF p_subject IS NOT NULL THEN
    v_scope := 'subject';
  ELSE
    v_scope := 'all';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id, q.text_quality, q.exam
    FROM public.questions q
    WHERE (q.is_active IS NULL OR q.is_active = true)
      AND (v_scope <> 'topic'   OR q.topic_id = p_topic_id)
      AND (v_scope <> 'chapter' OR q.chapter_id = p_chapter_id)
      AND (v_scope <> 'subject' OR lower(q.subject) = lower(p_subject))
      AND (v_pool IS NULL OR q.exam = ANY(v_pool))
      -- Class-level guard only when practising a whole subject / everything
      AND (
        v_scope IN ('topic','chapter')
        OR v_grade IS NULL
        OR q.class_level IS NULL
        OR q.class_level = v_grade
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
    SELECT c.id FROM candidates c
    ORDER BY
      (CASE WHEN c.text_quality = 'damaged' THEN 1 ELSE 0 END),
      (CASE WHEN v_native IS NULL OR c.exam = ANY(v_native) THEN 0 ELSE 1 END),
      random()
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT q.* FROM public.questions q JOIN picked p ON p.id = q.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid,text,text,uuid,uuid,text,uuid[],integer) TO authenticated, service_role;
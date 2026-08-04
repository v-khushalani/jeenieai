-- Native exam labels for a student's exam family
CREATE OR REPLACE FUNCTION public.exam_family(p_exam text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_exam IS NULL OR btrim(p_exam) = '' THEN NULL::text[]
    WHEN p_exam ILIKE '%jee%' THEN ARRAY['JEE','JEE Main','JEE Mains','JEE Advanced']
    WHEN p_exam ILIKE '%neet%' THEN ARRAY['NEET']
    ELSE ARRAY[p_exam]
  END;
$$;

-- Full pool = native family + shared Physics/Chemistry from the other family
CREATE OR REPLACE FUNCTION public.exam_pool(p_exam text, p_subject text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.exam_family(p_exam) IS NULL THEN NULL::text[]
    WHEN p_subject IS NULL OR lower(btrim(p_subject)) NOT IN ('physics','chemistry')
      THEN public.exam_family(p_exam)
    WHEN p_exam ILIKE '%jee%'
      THEN ARRAY['JEE','JEE Main','JEE Mains','JEE Advanced','NEET']
    WHEN p_exam ILIKE '%neet%'
      THEN ARRAY['NEET','JEE','JEE Main','JEE Mains']
    ELSE public.exam_family(p_exam)
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.exam_family(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.exam_pool(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.exam_family(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.exam_pool(text, text) TO authenticated, service_role;

-- Chapter counts by explicit chapter ids
CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_chapter_ids uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  LEFT JOIN public.chapters c ON c.id = q.chapter_id
  WHERE q.is_active = true
    AND q.chapter_id = ANY(p_chapter_ids)
    AND (
      public.exam_family(p_exam) IS NULL
      OR q.exam = ANY(public.exam_pool(p_exam, COALESCE(c.subject, q.subject)))
    )
  GROUP BY q.chapter_id;
$$;

-- Chapter counts by subject + batch scope
CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_subject text, p_batch_ids uuid[] DEFAULT NULL::uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
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
      public.exam_family(p_exam) IS NULL
      OR q.exam = ANY(public.exam_pool(p_exam, c.subject))
    )
  GROUP BY q.chapter_id;
$$;

-- Subject counts
CREATE OR REPLACE FUNCTION public.get_subject_question_counts(p_batch_ids uuid[] DEFAULT NULL::uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(subject text, count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
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
      public.exam_family(p_exam) IS NULL
      OR q.exam = ANY(public.exam_pool(p_exam, COALESCE(c.subject, q.subject)))
    )
  GROUP BY COALESCE(c.subject, q.subject);
$$;

-- Practice feed: native exam first, shared fill-in next, damaged last
CREATE OR REPLACE FUNCTION public.fetch_unseen_questions(p_user_id uuid, p_exam text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_chapter_id uuid DEFAULT NULL::uuid, p_topic_id uuid DEFAULT NULL::uuid, p_topic_name text DEFAULT NULL::text, p_batch_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 100)
RETURNS SETOF questions
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT
      COALESCE(
        p_subject,
        (SELECT c.subject FROM public.chapters c WHERE c.id = p_chapter_id),
        (SELECT c2.subject FROM public.topics t JOIN public.chapters c2 ON c2.id = t.chapter_id WHERE t.id = p_topic_id)
      ) AS subj
  ),
  fam AS (
    SELECT public.exam_family(p_exam) AS native_exams,
           public.exam_pool(p_exam, (SELECT subj FROM scope)) AS pool_exams
  ),
  candidates AS (
    SELECT q.id, q.text_quality, q.exam
    FROM public.questions q, fam f
    WHERE (q.is_active IS NULL OR q.is_active = true)
      AND (f.pool_exams IS NULL OR q.exam = ANY(f.pool_exams))
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
    SELECT c.id FROM candidates c, fam f
    ORDER BY
      (CASE WHEN c.text_quality = 'damaged' THEN 1 ELSE 0 END),
      (CASE WHEN f.native_exams IS NULL OR c.exam = ANY(f.native_exams) THEN 0 ELSE 1 END),
      random()
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT q.* FROM public.questions q JOIN picked p ON p.id = q.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_chapter_question_counts(text, uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[], text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid, text, text, uuid, uuid, text, uuid[], integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(text, uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid, text, text, uuid, uuid, text, uuid[], integer) TO authenticated, service_role;
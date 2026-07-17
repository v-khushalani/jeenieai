
-- 1) Dedupe existing attempts: keep earliest per (user_id, question_id)
DELETE FROM public.question_attempts a
USING public.question_attempts b
WHERE a.user_id = b.user_id
  AND a.question_id = b.question_id
  AND a.ctid > b.ctid;

-- 2) Enforce uniqueness going forward
CREATE UNIQUE INDEX IF NOT EXISTS question_attempts_user_question_uniq
  ON public.question_attempts(user_id, question_id);

-- 3) RPC: fetch questions the user has never seen, with common filters
CREATE OR REPLACE FUNCTION public.fetch_unseen_questions(
  p_user_id uuid,
  p_exam text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL,
  p_topic_id uuid DEFAULT NULL,
  p_topic_name text DEFAULT NULL,
  p_batch_ids uuid[] DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS SETOF public.questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.*
  FROM public.questions q
  WHERE (q.is_active IS NULL OR q.is_active = true)
    AND (p_exam IS NULL OR q.exam = p_exam)
    AND (p_topic_id IS NOT NULL AND q.topic_id = p_topic_id
         OR p_topic_id IS NULL AND p_chapter_id IS NOT NULL AND q.chapter_id = p_chapter_id
         OR p_topic_id IS NULL AND p_chapter_id IS NULL AND p_subject IS NOT NULL AND lower(q.subject) = lower(p_subject)
         OR p_topic_id IS NULL AND p_chapter_id IS NULL AND p_subject IS NULL)
    AND (p_topic_name IS NULL OR q.topic ILIKE '%' || p_topic_name || '%')
    AND (p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL OR q.batch_id = ANY(p_batch_ids))
    AND NOT EXISTS (
      SELECT 1 FROM public.question_attempts qa
      WHERE qa.user_id = p_user_id AND qa.question_id = q.id
    )
  ORDER BY random()
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid, text, text, uuid, uuid, text, uuid[], int) TO authenticated, service_role;

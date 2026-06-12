CREATE OR REPLACE FUNCTION public.get_questions_for_remap(batch_size integer DEFAULT 100)
RETURNS TABLE (id uuid, question_text text, subject text, chapter_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.question_text, q.subject, q.chapter_id
  FROM public.questions q
  WHERE q.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.question_chapter_remap r
      WHERE r.question_id = q.id
    )
  ORDER BY q.id
  LIMIT batch_size;
$$;

REVOKE EXECUTE ON FUNCTION public.get_questions_for_remap(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_questions_for_remap(integer) TO service_role;
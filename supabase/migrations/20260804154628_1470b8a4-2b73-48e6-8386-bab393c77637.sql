CREATE OR REPLACE FUNCTION public.next_damaged_questions(p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, question_text text, options jsonb, explanation text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.question_text, q.options, q.explanation
  FROM public.questions q
  WHERE q.text_quality = 'damaged'
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE EXECUTE ON FUNCTION public.next_damaged_questions(integer) FROM anon, authenticated;
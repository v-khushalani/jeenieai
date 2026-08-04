ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS text_quality text;

CREATE OR REPLACE FUNCTION public.classify_question_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR length(btrim(p_text)) = 0 THEN 'damaged'
    WHEN p_text ~ '[ÂÃ]|\uFFFD' THEN 'damaged'
    WHEN p_text ~ '\$|\\frac|\^|_\{' THEN 'ok'
    WHEN p_text ~ '[A-Za-z] [0-9]( |$|,|\.|\))' THEN 'damaged'
    WHEN p_text ~ '(log|sin|cos|tan|sec|cosec|cot) [0-9]' THEN 'damaged'
    ELSE 'ok'
  END;
$$;

CREATE OR REPLACE FUNCTION public.questions_set_text_quality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.text_quality := public.classify_question_text(NEW.question_text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_text_quality ON public.questions;
CREATE TRIGGER trg_questions_text_quality
BEFORE INSERT OR UPDATE OF question_text ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.questions_set_text_quality();

CREATE INDEX IF NOT EXISTS idx_questions_text_quality ON public.questions (text_quality);

CREATE OR REPLACE FUNCTION public.backfill_text_quality(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  WITH batch AS (
    SELECT id FROM public.questions WHERE text_quality IS NULL LIMIT GREATEST(p_limit,1)
  )
  UPDATE public.questions q
    SET text_quality = public.classify_question_text(q.question_text)
  FROM batch b WHERE q.id = b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.backfill_text_quality(integer) FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.repair_mojibake_batch(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  WITH target AS (
    SELECT id FROM public.questions
    WHERE question ~ '[ÂÃâ]' OR question_text ~ '[ÂÃâ]' OR option_a ~ '[ÂÃâ]'
       OR option_b ~ '[ÂÃâ]' OR option_c ~ '[ÂÃâ]' OR option_d ~ '[ÂÃâ]' OR explanation ~ '[ÂÃâ]'
    LIMIT p_limit
  ), upd AS (
    UPDATE public.questions q SET
      question = public.fix_mojibake(question),
      question_text = public.fix_mojibake(question_text),
      option_a = public.fix_mojibake(option_a),
      option_b = public.fix_mojibake(option_b),
      option_c = public.fix_mojibake(option_c),
      option_d = public.fix_mojibake(option_d),
      explanation = public.fix_mojibake(explanation)
    FROM target t WHERE q.id = t.id
    RETURNING q.id
  )
  SELECT count(*) INTO n FROM upd;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.repair_mojibake_batch(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_mojibake_batch(int) TO service_role;
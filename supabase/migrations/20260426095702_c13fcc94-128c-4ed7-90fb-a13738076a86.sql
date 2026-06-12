
-- Legacy-compatible single-option overload of validate_question_answer
CREATE OR REPLACE FUNCTION public.validate_question_answer(
  p_question_id uuid,
  p_selected_option text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q public.questions%ROWTYPE;
  v_is_correct boolean := false;
  v_correct_option text;
BEGIN
  SELECT * INTO q FROM public.questions WHERE id = p_question_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'question_not_found');
  END IF;

  -- Resolve the canonical correct option (first entry of correct_options array)
  IF q.correct_options IS NOT NULL AND array_length(q.correct_options, 1) >= 1 THEN
    v_correct_option := q.correct_options[1];
  ELSE
    v_correct_option := NULL;
  END IF;

  v_is_correct := p_selected_option IS NOT NULL
                  AND v_correct_option IS NOT NULL
                  AND upper(p_selected_option) = upper(v_correct_option);

  RETURN jsonb_build_object(
    'is_correct', v_is_correct,
    'correct_option', v_correct_option,
    'explanation', COALESCE(q.explanation, '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_question_answer(uuid, text) TO anon, authenticated;

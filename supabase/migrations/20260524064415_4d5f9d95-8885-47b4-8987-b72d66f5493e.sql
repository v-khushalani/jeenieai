
-- Ensure ON CONFLICT (user_id, topic_id) works when exam is null
CREATE UNIQUE INDEX IF NOT EXISTS topic_mastery_user_topic_uidx
  ON public.topic_mastery (user_id, topic_id);

CREATE OR REPLACE FUNCTION public.upsert_topic_mastery(p_user_id uuid, p_topic_id uuid, p_is_correct boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_new_attempted integer;
  v_new_correct integer;
  v_new_accuracy numeric;
  v_new_level text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT questions_attempted, questions_correct
  INTO v_existing
  FROM public.topic_mastery
  WHERE user_id = p_user_id AND topic_id = p_topic_id;

  IF FOUND THEN
    v_new_attempted := COALESCE(v_existing.questions_attempted, 0) + 1;
    v_new_correct := COALESCE(v_existing.questions_correct, 0) + (CASE WHEN p_is_correct THEN 1 ELSE 0 END);
  ELSE
    v_new_attempted := 1;
    v_new_correct := CASE WHEN p_is_correct THEN 1 ELSE 0 END;
  END IF;

  v_new_accuracy := CASE WHEN v_new_attempted > 0
    THEN ROUND((v_new_correct::numeric / v_new_attempted) * 100, 1)
    ELSE 0 END;

  v_new_level := CASE
    WHEN v_new_accuracy >= 90 AND v_new_attempted >= 60 THEN 'mastered'
    WHEN v_new_accuracy >= 85 AND v_new_attempted >= 40 THEN 'advanced'
    WHEN v_new_accuracy >= 70 AND v_new_attempted >= 25 THEN 'intermediate'
    ELSE 'beginner'
  END;

  INSERT INTO public.topic_mastery (
    user_id, topic_id, questions_attempted, questions_correct,
    accuracy, mastery_level, current_level, last_practiced, last_attempted, updated_at
  )
  VALUES (
    p_user_id, p_topic_id, v_new_attempted, v_new_correct,
    v_new_accuracy, ROUND(v_new_accuracy / 100.0, 4), v_new_level, now(), now(), now()
  )
  ON CONFLICT (user_id, topic_id)
  DO UPDATE SET
    questions_attempted = v_new_attempted,
    questions_correct = v_new_correct,
    accuracy = v_new_accuracy,
    mastery_level = ROUND(v_new_accuracy / 100.0, 4),
    current_level = v_new_level,
    last_practiced = now(),
    last_attempted = now(),
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'accuracy', v_new_accuracy,
    'level', v_new_level,
    'attempted', v_new_attempted
  );
END;
$function$;

-- Fix update_practice_stats for environments where profiles.questions_completed does not exist.
-- The canonical solved counter is profiles.total_questions_solved.
CREATE OR REPLACE FUNCTION public.update_practice_stats(
  p_user_id uuid,
  p_points_delta integer,
  p_is_correct boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
  v_new_total_points integer;
  v_new_total_solved integer;
  v_new_accuracy numeric;
  v_new_level text;
  v_new_level_progress numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT total_points, total_questions_solved, overall_accuracy
  INTO v_profile
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  v_new_total_points := GREATEST(0, COALESCE(v_profile.total_points, 0) + p_points_delta);
  v_new_total_solved := COALESCE(v_profile.total_questions_solved, 0) + 1;

  IF v_new_total_solved > 0 THEN
    v_new_accuracy := ROUND(
      ((COALESCE(v_profile.overall_accuracy, 0) * (v_new_total_solved - 1)) +
        (CASE WHEN p_is_correct THEN 100 ELSE 0 END))::numeric / v_new_total_solved,
      1
    );
  ELSE
    v_new_accuracy := 0;
  END IF;

  v_new_level := CASE
    WHEN v_new_total_points <= 1000 THEN 'BEGINNER'
    WHEN v_new_total_points <= 3000 THEN 'LEARNER'
    WHEN v_new_total_points <= 7000 THEN 'ACHIEVER'
    WHEN v_new_total_points <= 20000 THEN 'EXPERT'
    WHEN v_new_total_points <= 50000 THEN 'MASTER'
    ELSE 'LEGEND'
  END;

  v_new_level_progress := CASE
    WHEN v_new_total_points <= 1000 THEN (v_new_total_points::numeric / 1000) * 100
    WHEN v_new_total_points <= 3000 THEN ((v_new_total_points - 1001)::numeric / 1999) * 100
    WHEN v_new_total_points <= 7000 THEN ((v_new_total_points - 3001)::numeric / 3999) * 100
    WHEN v_new_total_points <= 20000 THEN ((v_new_total_points - 7001)::numeric / 12999) * 100
    WHEN v_new_total_points <= 50000 THEN ((v_new_total_points - 20001)::numeric / 29999) * 100
    ELSE 100
  END;

  UPDATE profiles SET
    total_points = v_new_total_points,
    total_questions_solved = v_new_total_solved,
    overall_accuracy = v_new_accuracy,
    level = v_new_level,
    level_progress = LEAST(v_new_level_progress, 100),
    last_activity = now(),
    updated_at = now()
  WHERE id = p_user_id;

  IF p_points_delta > 0 AND p_is_correct THEN
    INSERT INTO points_log (user_id, action_type, points, description)
    VALUES (p_user_id, 'correct_answer', LEAST(p_points_delta, 100), 'Correct answer');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_points', v_new_total_points,
    'total_questions_solved', v_new_total_solved,
    'overall_accuracy', v_new_accuracy,
    'level', v_new_level,
    'level_progress', LEAST(v_new_level_progress, 100)
  );
END;
$function$;

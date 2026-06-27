CREATE OR REPLACE FUNCTION public.advance_today_mission_on_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_mission public.daily_missions;
  v_q_subject text;
  v_q_chapter text;
  v_match boolean := false;
BEGIN
  IF NEW.mode IS DISTINCT FROM 'practice' THEN RETURN NEW; END IF;

  SELECT * INTO v_mission FROM public.daily_missions
    WHERE user_id = NEW.user_id AND mission_date = v_today
    FOR UPDATE;
  IF NOT FOUND OR v_mission.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT subject, chapter INTO v_q_subject, v_q_chapter
    FROM public.questions WHERE id = NEW.question_id;

  IF v_mission.chapter IS NULL OR v_mission.chapter = '' THEN
    v_match := true;
  ELSIF v_q_chapter IS NOT NULL AND lower(v_q_chapter) = lower(v_mission.chapter) THEN
    v_match := true;
  END IF;

  IF NOT v_match THEN RETURN NEW; END IF;

  UPDATE public.daily_missions
     SET progress_count = LEAST(v_mission.progress_count + 1, v_mission.target_count),
         status = CASE
           WHEN v_mission.progress_count + 1 >= v_mission.target_count THEN 'completed'
           ELSE 'in_progress'
         END
   WHERE id = v_mission.id;

  IF v_mission.progress_count + 1 >= v_mission.target_count AND NOT v_mission.reward_granted THEN
    UPDATE public.daily_missions SET reward_granted = true WHERE id = v_mission.id;

    UPDATE public.profiles
       SET total_points = COALESCE(total_points, 0) + v_mission.reward_points
     WHERE id = NEW.user_id;

    INSERT INTO public.points_log (user_id, action_type, points, description, reference_id)
    VALUES (
      NEW.user_id,
      'daily_mission_completed',
      v_mission.reward_points,
      'Mission complete: ' || COALESCE(v_mission.title, v_mission.rule_id),
      v_mission.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;
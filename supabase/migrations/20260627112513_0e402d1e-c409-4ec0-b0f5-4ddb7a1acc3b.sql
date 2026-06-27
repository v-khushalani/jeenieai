ALTER TABLE public.daily_missions
  ADD COLUMN IF NOT EXISTS reset_count integer NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.reset_today_mission();

CREATE OR REPLACE FUNCTION public.reset_today_mission()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_existing public.daily_missions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT * INTO v_existing FROM public.daily_missions
   WHERE user_id = v_user AND mission_date = v_today;

  IF FOUND AND v_existing.reset_count >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reset_limit_reached');
  END IF;

  IF FOUND AND v_existing.status <> 'completed' THEN
    DELETE FROM public.daily_missions WHERE id = v_existing.id;
    INSERT INTO public.daily_missions (
      user_id, mission_date, rule_id, title, mode,
      target_count, est_minutes, reward_points, status, reset_count
    ) VALUES (
      v_user, v_today, '_pending_reset', '_pending', 'practice',
      10, 15, 50, 'pending', v_existing.reset_count + 1
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_today_mission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_today_mission() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_or_create_today_mission(p_payload jsonb)
RETURNS public.daily_missions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_row public.daily_missions;
  v_carry_reset integer := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT * INTO v_row FROM public.daily_missions
   WHERE user_id = v_user AND mission_date = v_today;

  IF FOUND AND v_row.rule_id <> '_pending_reset' THEN
    RETURN v_row;
  END IF;

  IF FOUND AND v_row.rule_id = '_pending_reset' THEN
    v_carry_reset := v_row.reset_count;
    DELETE FROM public.daily_missions WHERE id = v_row.id;
  END IF;

  INSERT INTO public.daily_missions (
    user_id, mission_date, rule_id, title, subtitle,
    subject, chapter, topic, mode,
    target_count, est_minutes, reward_points, cta_route, reset_count
  ) VALUES (
    v_user, v_today,
    COALESCE(p_payload->>'rule_id', 'chapter_practice'),
    COALESCE(p_payload->>'title', 'Today''s Mission'),
    p_payload->>'subtitle',
    p_payload->>'subject',
    p_payload->>'chapter',
    p_payload->>'topic',
    COALESCE(p_payload->>'mode', 'practice'),
    COALESCE((p_payload->>'target_count')::int, 10),
    COALESCE((p_payload->>'est_minutes')::int, 15),
    COALESCE((p_payload->>'reward_points')::int, 50),
    p_payload->>'cta_route',
    v_carry_reset
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_today_mission(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_today_mission(jsonb) TO authenticated;
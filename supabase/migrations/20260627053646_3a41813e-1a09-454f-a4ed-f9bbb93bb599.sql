-- 1. daily_missions table
CREATE TABLE public.daily_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
  rule_id text NOT NULL,
  title text NOT NULL,
  subtitle text,
  subject text,
  chapter text,
  topic text,
  mode text NOT NULL DEFAULT 'practice',
  target_count integer NOT NULL DEFAULT 10,
  progress_count integer NOT NULL DEFAULT 0,
  est_minutes integer NOT NULL DEFAULT 15,
  reward_points integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  cta_route text,
  reward_granted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_missions_user_date_unique UNIQUE (user_id, mission_date)
);

-- 2. GRANTs
GRANT SELECT, INSERT, UPDATE ON public.daily_missions TO authenticated;
GRANT ALL ON public.daily_missions TO service_role;

-- 3. RLS
ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own missions"
  ON public.daily_missions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own missions"
  ON public.daily_missions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own missions"
  ON public.daily_missions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_daily_missions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_daily_missions_touch
  BEFORE UPDATE ON public.daily_missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_daily_missions_updated_at();

-- 5. RPC: get-or-create today's mission
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO v_row FROM public.daily_missions
   WHERE user_id = v_user AND mission_date = v_today;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.daily_missions (
    user_id, mission_date, rule_id, title, subtitle,
    subject, chapter, topic, mode,
    target_count, est_minutes, reward_points, cta_route
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
    p_payload->>'cta_route'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_today_mission(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_today_mission(jsonb) TO authenticated;

-- 6. Reset today's mission (used by cold-start picker to regenerate)
CREATE OR REPLACE FUNCTION public.reset_today_mission()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  DELETE FROM public.daily_missions
    WHERE user_id = v_user AND mission_date = v_today AND status <> 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.reset_today_mission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_today_mission() TO authenticated;

-- 7. Progress trigger: bump mission progress on each matching practice attempt
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
  IF NEW.mode IS DISTINCT FROM 'practice' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_mission FROM public.daily_missions
    WHERE user_id = NEW.user_id AND mission_date = v_today
    FOR UPDATE;
  IF NOT FOUND OR v_mission.status = 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT subject, chapter INTO v_q_subject, v_q_chapter
    FROM public.questions WHERE id = NEW.question_id;

  IF v_mission.chapter IS NULL OR v_mission.chapter = '' THEN
    v_match := true; -- mission without a chapter constraint (mock/etc) accepts any practice
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

  -- Award bonus points exactly once on completion
  IF v_mission.progress_count + 1 >= v_mission.target_count AND NOT v_mission.reward_granted THEN
    UPDATE public.daily_missions
       SET reward_granted = true
     WHERE id = v_mission.id;

    UPDATE public.profiles
       SET total_points = COALESCE(total_points, 0) + v_mission.reward_points
     WHERE id = NEW.user_id;

    INSERT INTO public.points_log (user_id, points, reason, metadata)
    VALUES (
      NEW.user_id,
      v_mission.reward_points,
      'daily_mission_completed',
      jsonb_build_object('mission_id', v_mission.id, 'rule_id', v_mission.rule_id, 'chapter', v_mission.chapter)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_today_mission ON public.question_attempts;
CREATE TRIGGER trg_advance_today_mission
  AFTER INSERT ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.advance_today_mission_on_attempt();
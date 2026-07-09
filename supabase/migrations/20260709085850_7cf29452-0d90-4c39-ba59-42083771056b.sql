
-- 1) Extend badges catalog
ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS rarity TEXT NOT NULL DEFAULT 'Common',
  ADD COLUMN IF NOT EXISTS requirement_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS requirement_value INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Ensure unique code for upsert safety
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'badges_code_key'
  ) THEN
    ALTER TABLE public.badges ADD CONSTRAINT badges_code_key UNIQUE (code);
  END IF;
END $$;

-- 2) Clear old catalog (safe: user_badges is empty post-wipe)
TRUNCATE TABLE public.user_badges;
DELETE FROM public.badges;

-- 3) Grants (defensive — re-assert)
GRANT SELECT ON public.badges TO anon, authenticated;
GRANT ALL ON public.badges TO service_role;
GRANT SELECT, INSERT, DELETE ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

-- 4) The unlock engine
CREATE OR REPLACE FUNCTION public.check_and_award_badges(_user_id UUID)
RETURNS TABLE(badge_id UUID, code TEXT, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_streak INT := 0;
  v_total_q INT := 0;
  v_total_correct INT := 0;
  v_best_correct_streak INT := 0;
  v_max_daily INT := 0;
  v_perfect_tests INT := 0;
  v_morning INT := 0;
  v_night INT := 0;
  v_shares INT := 0;
  v_badge RECORD;
  v_qualifies BOOLEAN;
BEGIN
  -- Pull user snapshot
  SELECT COALESCE(current_streak, 0) INTO v_streak FROM public.profiles WHERE id = _user_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_correct)
    INTO v_total_q, v_total_correct
    FROM public.question_attempts WHERE user_id = _user_id;

  -- Longest consecutive correct-answer streak (window walk)
  WITH ordered AS (
    SELECT is_correct,
           ROW_NUMBER() OVER (ORDER BY attempted_at) -
           ROW_NUMBER() OVER (PARTITION BY is_correct ORDER BY attempted_at) AS grp
    FROM public.question_attempts WHERE user_id = _user_id
  )
  SELECT COALESCE(MAX(cnt), 0) INTO v_best_correct_streak
  FROM (SELECT COUNT(*) AS cnt FROM ordered WHERE is_correct GROUP BY grp) s;

  -- Max questions in a single day
  SELECT COALESCE(MAX(cnt), 0) INTO v_max_daily
  FROM (
    SELECT COUNT(*) AS cnt
    FROM public.question_attempts
    WHERE user_id = _user_id
    GROUP BY date_trunc('day', attempted_at)
  ) d;

  -- Perfect test count
  SELECT COUNT(*) INTO v_perfect_tests
  FROM public.test_sessions
  WHERE user_id = _user_id AND score = 100 AND total_questions >= 5;

  -- Morning sessions (before 8am local UTC approx) — count distinct days
  SELECT COUNT(DISTINCT date_trunc('day', attempted_at)) INTO v_morning
  FROM public.question_attempts
  WHERE user_id = _user_id AND EXTRACT(HOUR FROM attempted_at) < 8;

  SELECT COUNT(DISTINCT date_trunc('day', attempted_at)) INTO v_night
  FROM public.question_attempts
  WHERE user_id = _user_id AND EXTRACT(HOUR FROM attempted_at) >= 23;

  -- Shares from points_log
  SELECT COUNT(*) INTO v_shares
  FROM public.points_log
  WHERE user_id = _user_id AND action_type IN ('badge_share', 'result_share', 'share');

  -- Iterate badges and award missing
  FOR v_badge IN
    SELECT b.id, b.code, b.name, b.requirement_type, b.requirement_value
    FROM public.badges b
    WHERE b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.user_badges ub
        WHERE ub.user_id = _user_id AND ub.badge_id = b.id
      )
  LOOP
    v_qualifies := CASE v_badge.requirement_type
      WHEN 'day_streak'       THEN v_streak            >= v_badge.requirement_value
      WHEN 'answer_streak'    THEN v_best_correct_streak >= v_badge.requirement_value
      WHEN 'total_questions'  THEN v_total_q           >= v_badge.requirement_value
      WHEN 'total_correct'    THEN v_total_correct     >= v_badge.requirement_value
      WHEN 'daily_questions'  THEN v_max_daily         >= v_badge.requirement_value
      WHEN 'perfect_test'     THEN v_perfect_tests     >= v_badge.requirement_value
      WHEN 'morning_sessions' THEN v_morning           >= v_badge.requirement_value
      WHEN 'night_sessions'   THEN v_night             >= v_badge.requirement_value
      WHEN 'shares'           THEN v_shares            >= v_badge.requirement_value
      ELSE FALSE
    END;

    IF v_qualifies THEN
      INSERT INTO public.user_badges (user_id, badge_id, earned_at)
      VALUES (_user_id, v_badge.id, now())
      ON CONFLICT DO NOTHING;
      badge_id := v_badge.id; code := v_badge.code; name := v_badge.name;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.check_and_award_badges(UUID) TO authenticated, service_role;

-- 5) Auto-fire on question_attempts insert
CREATE OR REPLACE FUNCTION public.trg_award_badges_on_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_and_award_badges(NEW.user_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block attempt insert
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS award_badges_after_attempt ON public.question_attempts;
CREATE TRIGGER award_badges_after_attempt
  AFTER INSERT ON public.question_attempts
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_badges_on_attempt();

-- 6) Auto-fire on streak change
CREATE OR REPLACE FUNCTION public.trg_award_badges_on_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_streak IS DISTINCT FROM OLD.current_streak AND NEW.current_streak > 0 THEN
    PERFORM public.check_and_award_badges(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS award_badges_after_streak ON public.profiles;
CREATE TRIGGER award_badges_after_streak
  AFTER UPDATE OF current_streak ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_award_badges_on_streak();

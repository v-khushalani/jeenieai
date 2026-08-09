-- ============ 1. Streak repair columns ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_streak_repair integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_streak_repair_date date;

-- ============ 2. Leagues ============
CREATE TABLE IF NOT EXISTS public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL DEFAULT 'bronze',
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);

GRANT SELECT ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;
GRANT SELECT ON public.league_members TO authenticated;
GRANT ALL ON public.league_members TO service_role;

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read leagues" ON public.leagues;
CREATE POLICY "Authenticated can read leagues"
  ON public.leagues FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Members read their own league roster" ON public.league_members;
CREATE POLICY "Members read their own league roster"
  ON public.league_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.league_members me
      WHERE me.user_id = auth.uid() AND me.league_id = league_members.league_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_league_members_league_xp ON public.league_members(league_id, xp DESC);
CREATE INDEX IF NOT EXISTS idx_league_members_user ON public.league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_leagues_cycle ON public.leagues(cycle_start, cycle_end, tier);

-- current IST week (Mon..Sun)
CREATE OR REPLACE FUNCTION public.current_cycle_start()
RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')))::date;
$$;

-- Places the caller in a league for the current week (max 30 per league)
CREATE OR REPLACE FUNCTION public.join_current_league()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_start date := public.current_cycle_start();
  v_end date := v_start + 6;
  v_tier text := 'bronze';
  v_league uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT lm.league_id INTO v_league
  FROM public.league_members lm
  JOIN public.leagues l ON l.id = lm.league_id
  WHERE lm.user_id = v_uid AND l.cycle_start = v_start
  LIMIT 1;
  IF v_league IS NOT NULL THEN RETURN v_league; END IF;

  -- carry over the tier the student ended last week in
  SELECT l.tier INTO v_tier
  FROM public.league_members lm
  JOIN public.leagues l ON l.id = lm.league_id
  WHERE lm.user_id = v_uid
  ORDER BY l.cycle_start DESC LIMIT 1;
  v_tier := COALESCE(v_tier, 'bronze');

  SELECT l.id INTO v_league
  FROM public.leagues l
  WHERE l.cycle_start = v_start AND l.tier = v_tier
    AND (SELECT count(*) FROM public.league_members m WHERE m.league_id = l.id) < 30
  ORDER BY l.created_at
  LIMIT 1;

  IF v_league IS NULL THEN
    INSERT INTO public.leagues (tier, cycle_start, cycle_end)
    VALUES (v_tier, v_start, v_end)
    RETURNING id INTO v_league;
  END IF;

  INSERT INTO public.league_members (league_id, user_id)
  VALUES (v_league, v_uid)
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN v_league;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_league()
RETURNS TABLE(
  league_id uuid, tier text, cycle_start date, cycle_end date,
  user_id uuid, full_name text, avatar_url text, xp integer, rank bigint, is_me boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_league uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT lm.league_id INTO v_league
  FROM public.league_members lm
  JOIN public.leagues l ON l.id = lm.league_id
  WHERE lm.user_id = v_uid AND l.cycle_start = public.current_cycle_start()
  LIMIT 1;

  IF v_league IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.id, l.tier, l.cycle_start, l.cycle_end,
         m.user_id,
         COALESCE(p.full_name, 'Student'),
         p.avatar_url,
         m.xp,
         RANK() OVER (ORDER BY m.xp DESC, m.joined_at ASC),
         (m.user_id = v_uid)
  FROM public.league_members m
  JOIN public.leagues l ON l.id = m.league_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.league_id = v_league
  ORDER BY m.xp DESC, m.joined_at ASC;
END;
$$;

-- ============ 3. Daily XP engine ============
CREATE OR REPLACE FUNCTION public.award_xp(p_is_correct boolean, p_combo integer DEFAULT 0, p_amount integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_xp integer := 0;
  v_daily integer := 0;
  v_goal integer := 15;
  v_streak integer := 0;
  v_league uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Unauthorized'); END IF;

  IF p_amount IS NOT NULL THEN
    v_xp := GREATEST(p_amount, 0);
  ELSIF p_is_correct THEN
    v_xp := 10
      + CASE WHEN p_combo >= 10 THEN 20
             WHEN p_combo >= 5 THEN 10
             WHEN p_combo >= 3 THEN 5
             ELSE 0 END;
  ELSE
    v_xp := 0;
  END IF;

  UPDATE public.profiles
  SET daily_xp = CASE WHEN daily_xp_date IS DISTINCT FROM v_today THEN v_xp ELSE COALESCE(daily_xp,0) + v_xp END,
      daily_xp_date = v_today,
      updated_at = now()
  WHERE id = v_uid
  RETURNING daily_xp, COALESCE(daily_goal,15), COALESCE(current_streak,0)
  INTO v_daily, v_goal, v_streak;

  IF v_xp > 0 THEN
    v_league := public.join_current_league();
    IF v_league IS NOT NULL THEN
      UPDATE public.league_members
      SET xp = xp + v_xp, updated_at = now()
      WHERE league_id = v_league AND user_id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'xp_awarded', v_xp,
    'daily_xp', COALESCE(v_daily,0),
    'xp_goal', GREATEST(v_goal,1) * 10,
    'streak', v_streak
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_xp_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_p RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Unauthorized'); END IF;
  SELECT daily_xp, daily_xp_date, COALESCE(daily_goal,15) AS daily_goal,
         COALESCE(current_streak,0) AS current_streak,
         COALESCE(streak_freeze_available,false) AS freeze,
         COALESCE(pending_streak_repair,0) AS repair,
         pending_streak_repair_date
  INTO v_p FROM public.profiles WHERE id = v_uid;

  RETURN jsonb_build_object(
    'daily_xp', CASE WHEN v_p.daily_xp_date IS DISTINCT FROM v_today THEN 0 ELSE COALESCE(v_p.daily_xp,0) END,
    'xp_goal', GREATEST(v_p.daily_goal,1) * 10,
    'daily_goal', v_p.daily_goal,
    'streak', v_p.current_streak,
    'freeze_available', v_p.freeze,
    'repair_available', (v_p.repair > 0 AND v_p.pending_streak_repair_date = v_today),
    'repair_streak_value', v_p.repair
  );
END;
$$;

-- ============ 4. Streak repair ============
-- Remember the streak we just lost so it can be repaired the same day.
CREATE OR REPLACE FUNCTION public.check_and_reset_streak(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile RECORD;
  v_today text;
  v_yesterday text;
  v_days_since integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  v_today := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
  v_yesterday := to_char((now() AT TIME ZONE 'Asia/Kolkata' - interval '1 day'), 'YYYY-MM-DD');

  SELECT current_streak, last_activity_date, last_streak_date, streak_freeze_available
  INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND OR v_profile.last_activity_date IS NULL THEN
    RETURN jsonb_build_object('success', true, 'streak', 0, 'reset', false);
  END IF;

  IF v_profile.last_streak_date IS NOT NULL AND
     (v_profile.last_streak_date::text = v_today OR v_profile.last_streak_date::text = v_yesterday) THEN
    RETURN jsonb_build_object('success', true, 'streak', COALESCE(v_profile.current_streak, 0), 'reset', false);
  END IF;

  IF v_profile.last_streak_date IS NOT NULL THEN
    v_days_since := (v_today::date - v_profile.last_streak_date)::integer;
  ELSE
    v_days_since := 999;
  END IF;

  IF v_days_since = 2 AND COALESCE(v_profile.streak_freeze_available, false) THEN
    RETURN jsonb_build_object('success', true, 'streak', COALESCE(v_profile.current_streak, 0), 'reset', false, 'freeze_available', true);
  END IF;

  IF COALESCE(v_profile.current_streak, 0) > 0 THEN
    UPDATE public.profiles
    SET current_streak = 0,
        pending_streak_repair = v_profile.current_streak,
        pending_streak_repair_date = (now() AT TIME ZONE 'Asia/Kolkata')::date,
        updated_at = now()
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'streak', 0, 'reset', true, 'previous_streak', v_profile.current_streak, 'repair_available', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'streak', 0, 'reset', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_streak()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start timestamptz := (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata');
  v_count bigint;
  v_p RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Unauthorized'); END IF;

  SELECT COALESCE(pending_streak_repair,0) AS repair, pending_streak_repair_date
  INTO v_p FROM public.profiles WHERE id = v_uid;

  IF v_p.repair <= 0 OR v_p.pending_streak_repair_date IS DISTINCT FROM v_today THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_repair_available');
  END IF;

  SELECT count(*) INTO v_count
  FROM public.question_attempts
  WHERE user_id = v_uid AND COALESCE(mode,'practice') <> 'test' AND created_at >= v_start;

  IF v_count < 10 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_enough', 'solved', v_count, 'needed', 10);
  END IF;

  UPDATE public.profiles
  SET current_streak = v_p.repair,
      longest_streak = GREATEST(COALESCE(longest_streak,0), v_p.repair),
      last_streak_date = v_today,
      pending_streak_repair = 0,
      pending_streak_repair_date = NULL,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true, 'streak', v_p.repair);
END;
$$;

-- ============ 5. Hide damaged questions everywhere ============
CREATE OR REPLACE FUNCTION public.fetch_unseen_questions(p_user_id uuid, p_exam text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_chapter_id uuid DEFAULT NULL::uuid, p_topic_id uuid DEFAULT NULL::uuid, p_topic_name text DEFAULT NULL::text, p_batch_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 100)
RETURNS SETOF public.questions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_subject text;
  v_grade integer;
  v_native text[];
  v_pool text[];
  v_scope text;
BEGIN
  v_subject := COALESCE(
    p_subject,
    (SELECT c.subject FROM public.chapters c WHERE c.id = p_chapter_id),
    (SELECT c2.subject FROM public.topics t JOIN public.chapters c2 ON c2.id = t.chapter_id WHERE t.id = p_topic_id)
  );
  SELECT pr.grade INTO v_grade FROM public.profiles pr WHERE pr.id = p_user_id;
  v_native := public.exam_family(p_exam);
  v_pool := public.exam_pool(p_exam, v_subject);

  IF p_topic_id IS NOT NULL THEN v_scope := 'topic';
  ELSIF p_chapter_id IS NOT NULL THEN v_scope := 'chapter';
  ELSIF p_subject IS NOT NULL THEN v_scope := 'subject';
  ELSE v_scope := 'all';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id, q.exam
    FROM public.questions q
    WHERE (q.is_active IS NULL OR q.is_active = true)
      AND (q.text_quality IS NULL OR q.text_quality <> 'damaged')
      AND (v_scope <> 'topic'   OR q.topic_id = p_topic_id)
      AND (v_scope <> 'chapter' OR q.chapter_id = p_chapter_id)
      AND (v_scope <> 'subject' OR lower(q.subject) = lower(p_subject))
      AND (v_pool IS NULL OR q.exam = ANY(v_pool))
      AND (
        v_scope IN ('topic','chapter')
        OR v_grade IS NULL
        OR q.class_level IS NULL
        OR q.class_level = v_grade
      )
      AND (p_topic_name IS NULL OR q.topic ILIKE '%' || p_topic_name || '%')
      AND (p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL OR q.batch_id = ANY(p_batch_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.question_attempts qa
        WHERE qa.user_id = p_user_id AND qa.question_id = q.id
      )
    LIMIT 4000
  ),
  picked AS (
    SELECT c.id FROM candidates c
    ORDER BY
      (CASE WHEN v_native IS NULL OR c.exam = ANY(v_native) THEN 0 ELSE 1 END),
      random()
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT q.* FROM public.questions q JOIN picked p ON p.id = q.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_chapter_ids uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (
    SELECT c.id, c.subject FROM public.chapters c WHERE c.id = ANY(p_chapter_ids)
  ),
  p AS (
    SELECT public.exam_family(p_exam) AS fam,
           public.exam_pool(p_exam, 'physics') AS pool_shared,
           public.exam_pool(p_exam, 'other') AS pool_other
  )
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  JOIN ids ON ids.id = q.chapter_id
  CROSS JOIN p
  WHERE q.is_active = true
    AND (q.text_quality IS NULL OR q.text_quality <> 'damaged')
    AND (
      p.fam IS NULL
      OR q.exam = ANY(
        CASE WHEN lower(COALESCE(ids.subject, '')) IN ('physics', 'chemistry')
             THEN p.pool_shared ELSE p.pool_other END
      )
    )
  GROUP BY q.chapter_id;
$$;

CREATE OR REPLACE FUNCTION public.get_chapter_question_counts(p_subject text, p_batch_ids uuid[] DEFAULT NULL::uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(chapter_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH batch_scope AS (
    SELECT DISTINCT b.grade FROM public.batches b
    WHERE p_batch_ids IS NOT NULL AND cardinality(p_batch_ids) > 0 AND b.id = ANY(p_batch_ids)
  )
  SELECT q.chapter_id, COUNT(*)::bigint
  FROM public.questions q
  JOIN public.chapters c ON c.id = q.chapter_id
  WHERE q.is_active = true
    AND (q.text_quality IS NULL OR q.text_quality <> 'damaged')
    AND c.is_active = true
    AND q.chapter_id IS NOT NULL
    AND c.subject ILIKE p_subject
    AND (
      p_batch_ids IS NULL OR cardinality(p_batch_ids) = 0
      OR q.batch_id = ANY(p_batch_ids) OR c.batch_id = ANY(p_batch_ids)
      OR c.class_level IN (SELECT grade FROM batch_scope)
    )
    AND (
      public.exam_family(p_exam) IS NULL
      OR q.exam = ANY(public.exam_pool(p_exam, c.subject))
    )
  GROUP BY q.chapter_id;
$$;

CREATE OR REPLACE FUNCTION public.get_subject_question_counts(p_batch_ids uuid[] DEFAULT NULL::uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(subject text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH batch_scope AS (
    SELECT DISTINCT b.grade FROM public.batches b
    WHERE p_batch_ids IS NOT NULL AND cardinality(p_batch_ids) > 0 AND b.id = ANY(p_batch_ids)
  )
  SELECT COALESCE(c.subject, q.subject) AS subject, COUNT(*)::bigint
  FROM public.questions q
  LEFT JOIN public.chapters c ON c.id = q.chapter_id
  WHERE q.is_active = true
    AND (q.text_quality IS NULL OR q.text_quality <> 'damaged')
    AND (c.id IS NULL OR c.is_active = true)
    AND COALESCE(c.subject, q.subject) IS NOT NULL
    AND (
      p_batch_ids IS NULL OR cardinality(p_batch_ids) = 0
      OR q.batch_id = ANY(p_batch_ids) OR c.batch_id = ANY(p_batch_ids)
      OR c.class_level IN (SELECT grade FROM batch_scope)
    )
    AND (
      public.exam_family(p_exam) IS NULL
      OR q.exam = ANY(public.exam_pool(p_exam, COALESCE(c.subject, q.subject)))
    )
  GROUP BY COALESCE(c.subject, q.subject);
$$;

CREATE OR REPLACE FUNCTION public.get_topic_question_counts(p_chapter_id uuid)
RETURNS TABLE(topic_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT topic_id, COUNT(*)::bigint
  FROM public.questions
  WHERE is_active = true AND chapter_id = p_chapter_id AND topic_id IS NOT NULL
    AND (text_quality IS NULL OR text_quality <> 'damaged')
  GROUP BY topic_id;
$$;

CREATE OR REPLACE FUNCTION public.get_topic_question_counts(p_chapter_id uuid, p_batch_ids uuid[] DEFAULT NULL::uuid[], p_exam text DEFAULT NULL::text)
RETURNS TABLE(topic_id uuid, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT topic_id, COUNT(*)::bigint
  FROM public.questions
  WHERE is_active = true
    AND chapter_id = p_chapter_id
    AND topic_id IS NOT NULL
    AND (text_quality IS NULL OR text_quality <> 'damaged')
    AND (p_batch_ids IS NULL OR cardinality(p_batch_ids) = 0 OR batch_id = ANY(p_batch_ids) OR batch_id IS NULL)
    AND (
      p_exam IS NULL
      OR (p_exam ILIKE '%jee%'  AND exam ILIKE '%jee%')
      OR (p_exam ILIKE '%neet%' AND exam ILIKE '%neet%')
      OR (p_exam NOT ILIKE '%jee%' AND p_exam NOT ILIKE '%neet%' AND exam = p_exam)
    )
  GROUP BY topic_id;
$$;

-- ============ 6. Reminder helper (service role only) ============
CREATE OR REPLACE FUNCTION public.users_needing_reminder(p_min_streak integer DEFAULT 0)
RETURNS TABLE(user_id uuid, full_name text, daily_xp integer, xp_goal integer, current_streak integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(p.full_name,'Student'),
         CASE WHEN p.daily_xp_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 0 ELSE COALESCE(p.daily_xp,0) END,
         GREATEST(COALESCE(p.daily_goal,15),1) * 10,
         COALESCE(p.current_streak,0)
  FROM public.profiles p
  WHERE COALESCE(p.current_streak,0) >= p_min_streak
    AND (
      CASE WHEN p.daily_xp_date IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 0 ELSE COALESCE(p.daily_xp,0) END
      < GREATEST(COALESCE(p.daily_goal,15),1) * 10
    )
    AND EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = p.id);
$$;

-- ============ 7. Grants on the new functions ============
REVOKE ALL ON FUNCTION public.users_needing_reminder(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.users_needing_reminder(integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.award_xp(boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_xp_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_streak() TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_current_league() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_league() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_cycle_start() TO authenticated, service_role;
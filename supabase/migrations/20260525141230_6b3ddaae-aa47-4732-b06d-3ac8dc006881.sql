-- Reliable practice validation endpoint without overloaded RPC ambiguity
CREATE OR REPLACE FUNCTION public.validate_practice_answer(
  p_question_id uuid,
  p_selected_options text[] DEFAULT NULL::text[],
  p_numerical_answer numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.questions%ROWTYPE;
  v_selected text[];
  v_correct text[];
  v_is_correct boolean := false;
BEGIN
  SELECT * INTO q
  FROM public.questions
  WHERE id = p_question_id
    AND COALESCE(is_active, true) = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'question_not_found', 'is_correct', false);
  END IF;

  IF q.question_type IN ('numerical_int', 'numerical_decimal') OR q.numerical_answer IS NOT NULL THEN
    v_is_correct := p_numerical_answer IS NOT NULL
      AND q.numerical_answer IS NOT NULL
      AND ABS(p_numerical_answer - q.numerical_answer) <= COALESCE(q.numerical_tolerance, 0);
  ELSE
    SELECT array_agg(upper(trim(x)) ORDER BY upper(trim(x))) INTO v_selected
    FROM unnest(COALESCE(p_selected_options, ARRAY[]::text[])) AS x
    WHERE trim(x) <> '';

    SELECT array_agg(upper(trim(x)) ORDER BY upper(trim(x))) INTO v_correct
    FROM unnest(
      CASE
        WHEN q.correct_options IS NOT NULL AND array_length(q.correct_options, 1) > 0 THEN q.correct_options
        WHEN q.correct_option IS NOT NULL AND trim(q.correct_option) <> '' THEN string_to_array(q.correct_option, ',')
        ELSE ARRAY[]::text[]
      END
    ) AS x
    WHERE trim(x) <> '';

    v_is_correct := COALESCE(array_length(v_selected, 1), 0) > 0
      AND COALESCE(array_length(v_correct, 1), 0) > 0
      AND v_selected = v_correct;
  END IF;

  RETURN jsonb_build_object(
    'is_correct', COALESCE(v_is_correct, false),
    'correct_options', COALESCE(v_correct, q.correct_options),
    'correct_option', COALESCE(array_to_string(v_correct, ','), q.correct_option),
    'numerical_answer', q.numerical_answer,
    'explanation', COALESCE(q.explanation, '')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_practice_answer(uuid, text[], numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_practice_answer(uuid, text[], numeric) TO authenticated;

-- Pro+ Battle Mode
CREATE TABLE IF NOT EXISTS public.battle_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'expired')),
  subject text,
  chapter text,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  difficulty text DEFAULT 'Medium',
  question_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  max_players integer NOT NULL DEFAULT 2 CHECK (max_players BETWEEN 2 AND 4),
  started_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  completed_at timestamptz,
  winner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.battle_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  score integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  finished_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.battle_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_options text[],
  numerical_answer numeric,
  is_correct boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.battle_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES public.battle_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_type text NOT NULL DEFAULT 'battle_points',
  points integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT 'Battle Reward',
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_battle_sessions_status ON public.battle_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_battle_sessions_created_by ON public.battle_sessions(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_players_user ON public.battle_players(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_players_battle ON public.battle_players(battle_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_battle_answers_user_battle ON public.battle_answers(user_id, battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_rewards_user ON public.battle_rewards(user_id, created_at DESC);

ALTER TABLE public.battle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "battle sessions visible to participants" ON public.battle_sessions;
CREATE POLICY "battle sessions visible to participants"
ON public.battle_sessions
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR winner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.battle_players bp
    WHERE bp.battle_id = battle_sessions.id AND bp.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

DROP POLICY IF EXISTS "battle players visible to participants" ON public.battle_players;
CREATE POLICY "battle players visible to participants"
ON public.battle_players
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.battle_players mine
    WHERE mine.battle_id = battle_players.battle_id AND mine.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

DROP POLICY IF EXISTS "battle answers own rows" ON public.battle_answers;
CREATE POLICY "battle answers own rows"
ON public.battle_answers
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

DROP POLICY IF EXISTS "battle rewards own rows" ON public.battle_rewards;
CREATE POLICY "battle rewards own rows"
ON public.battle_rewards
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE OR REPLACE FUNCTION public.is_active_pro_plus(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND COALESCE(p.is_premium, false) = true
      AND COALESCE(p.subscription_plan, '') IN ('pro_plus', 'pro_plus_monthly', 'pro_plus_yearly')
      AND (p.subscription_end_date IS NULL OR p.subscription_end_date > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.start_battle(
  p_subject text DEFAULT NULL,
  p_chapter text DEFAULT NULL,
  p_topic_id uuid DEFAULT NULL,
  p_difficulty text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_battle public.battle_sessions%ROWTYPE;
  v_profile record;
  v_question_ids uuid[];
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT public.is_active_pro_plus(v_user) THEN
    RETURN jsonb_build_object('error', 'pro_plus_required');
  END IF;

  SELECT full_name, email, target_exam INTO v_profile
  FROM public.profiles
  WHERE id = v_user;

  SELECT bs.* INTO v_battle
  FROM public.battle_sessions bs
  WHERE bs.status = 'waiting'
    AND bs.expires_at > now()
    AND COALESCE(bs.subject, '') = COALESCE(p_subject, bs.subject, '')
    AND COALESCE(bs.chapter, '') = COALESCE(p_chapter, bs.chapter, '')
    AND (p_topic_id IS NULL OR bs.topic_id = p_topic_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.battle_players bp
      WHERE bp.battle_id = bs.id AND bp.user_id = v_user
    )
    AND (SELECT count(*) FROM public.battle_players bp WHERE bp.battle_id = bs.id) < bs.max_players
  ORDER BY bs.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT array_agg(id) INTO v_question_ids
    FROM (
      SELECT q.id
      FROM public.questions q
      WHERE COALESCE(q.is_active, true) = true
        AND (p_subject IS NULL OR q.subject ILIKE p_subject)
        AND (p_chapter IS NULL OR q.chapter ILIKE p_chapter)
        AND (p_topic_id IS NULL OR q.topic_id = p_topic_id)
        AND (p_difficulty IS NULL OR q.difficulty ILIKE p_difficulty)
        AND (q.correct_options IS NOT NULL OR q.correct_option IS NOT NULL OR q.numerical_answer IS NOT NULL)
      ORDER BY random()
      LIMIT 5
    ) picked;

    IF COALESCE(array_length(v_question_ids, 1), 0) = 0 THEN
      SELECT array_agg(id) INTO v_question_ids
      FROM (
        SELECT q.id
        FROM public.questions q
        WHERE COALESCE(q.is_active, true) = true
          AND (q.correct_options IS NOT NULL OR q.correct_option IS NOT NULL OR q.numerical_answer IS NOT NULL)
        ORDER BY random()
        LIMIT 5
      ) picked;
    END IF;

    INSERT INTO public.battle_sessions (status, subject, chapter, topic_id, difficulty, question_ids, created_by)
    VALUES ('waiting', p_subject, p_chapter, p_topic_id, COALESCE(p_difficulty, 'Medium'), COALESCE(v_question_ids, ARRAY[]::uuid[]), v_user)
    RETURNING * INTO v_battle;
  END IF;

  INSERT INTO public.battle_players (battle_id, user_id, display_name)
  VALUES (v_battle.id, v_user, COALESCE(NULLIF(v_profile.full_name, ''), split_part(v_profile.email, '@', 1), 'Student'))
  ON CONFLICT (battle_id, user_id) DO NOTHING;

  IF (SELECT count(*) FROM public.battle_players WHERE battle_id = v_battle.id) >= v_battle.max_players THEN
    UPDATE public.battle_sessions
    SET status = 'active', started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE id = v_battle.id
    RETURNING * INTO v_battle;
  END IF;

  RETURN jsonb_build_object('battle_id', v_battle.id, 'status', v_battle.status, 'question_ids', v_battle.question_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_battle_answer(
  p_battle_id uuid,
  p_question_id uuid,
  p_selected_options text[] DEFAULT NULL::text[],
  p_numerical_answer numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_validation jsonb;
  v_is_correct boolean;
  v_points integer;
  v_player public.battle_players%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_player
  FROM public.battle_players
  WHERE battle_id = p_battle_id AND user_id = v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_in_battle');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.battle_sessions
    WHERE id = p_battle_id
      AND status IN ('waiting', 'active')
      AND expires_at > now()
      AND p_question_id = ANY(question_ids)
  ) THEN
    RETURN jsonb_build_object('error', 'battle_not_active');
  END IF;

  v_validation := public.validate_practice_answer(p_question_id, p_selected_options, p_numerical_answer);
  v_is_correct := COALESCE((v_validation->>'is_correct')::boolean, false);
  v_points := CASE WHEN v_is_correct THEN 100 + LEAST(50, v_player.streak * 10) ELSE -20 END;

  INSERT INTO public.battle_answers (battle_id, user_id, question_id, selected_options, numerical_answer, is_correct, points)
  VALUES (p_battle_id, v_user, p_question_id, p_selected_options, p_numerical_answer, v_is_correct, v_points)
  ON CONFLICT (battle_id, user_id, question_id) DO UPDATE SET
    selected_options = EXCLUDED.selected_options,
    numerical_answer = EXCLUDED.numerical_answer,
    is_correct = EXCLUDED.is_correct,
    points = EXCLUDED.points,
    answered_at = now();

  UPDATE public.battle_players
  SET score = GREATEST(0, score + v_points),
      correct_count = correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
      wrong_count = wrong_count + CASE WHEN v_is_correct THEN 0 ELSE 1 END,
      streak = CASE WHEN v_is_correct THEN streak + 1 ELSE 0 END
  WHERE battle_id = p_battle_id AND user_id = v_user;

  RETURN v_validation || jsonb_build_object('points', v_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_battle(p_battle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_winner uuid;
  v_player record;
  v_reward_points integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.battle_players WHERE battle_id = p_battle_id AND user_id = v_user) THEN
    RETURN jsonb_build_object('error', 'not_in_battle');
  END IF;

  UPDATE public.battle_players
  SET finished_at = COALESCE(finished_at, now())
  WHERE battle_id = p_battle_id AND user_id = v_user;

  SELECT user_id INTO v_winner
  FROM public.battle_players
  WHERE battle_id = p_battle_id
  ORDER BY score DESC, correct_count DESC, joined_at ASC
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1
    FROM public.battle_players bp
    WHERE bp.battle_id = p_battle_id AND bp.finished_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.battle_sessions bs WHERE bs.id = p_battle_id AND bs.expires_at <= now()
  ) THEN
    UPDATE public.battle_sessions
    SET status = 'completed', completed_at = COALESCE(completed_at, now()), winner_user_id = v_winner, updated_at = now()
    WHERE id = p_battle_id;

    FOR v_player IN SELECT * FROM public.battle_players WHERE battle_id = p_battle_id LOOP
      v_reward_points := CASE WHEN v_player.user_id = v_winner THEN 250 ELSE 75 END;
      INSERT INTO public.battle_rewards (battle_id, user_id, points, title)
      VALUES (p_battle_id, v_player.user_id, v_reward_points, CASE WHEN v_player.user_id = v_winner THEN 'Battle Champion' ELSE 'Battle Finisher' END)
      ON CONFLICT (battle_id, user_id, reward_type) DO NOTHING;

      UPDATE public.profiles
      SET total_points = COALESCE(total_points, 0) + v_reward_points,
          updated_at = now()
      WHERE id = v_player.user_id;

      INSERT INTO public.points_log (user_id, action_type, points, description, reference_id)
      VALUES (v_player.user_id, 'battle_reward', v_reward_points, CASE WHEN v_player.user_id = v_winner THEN 'Won a Pro+ battle' ELSE 'Completed a Pro+ battle' END, p_battle_id::text);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('battle_id', p_battle_id, 'winner_user_id', v_winner);
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_pro_plus(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_battle(text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_battle_answer(uuid, uuid, text[], numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_battle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_pro_plus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_battle(text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_battle_answer(uuid, uuid, text[], numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_battle(uuid) TO authenticated;

-- Keep modified timestamps fresh when project helper exists
DROP TRIGGER IF EXISTS battle_sessions_updated_at ON public.battle_sessions;
CREATE TRIGGER battle_sessions_updated_at
BEFORE UPDATE ON public.battle_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
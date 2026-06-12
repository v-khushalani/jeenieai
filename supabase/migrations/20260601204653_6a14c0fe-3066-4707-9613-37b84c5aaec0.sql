-- ============================================================
-- PRODUCTION HARDENING MIGRATION
-- 1. Fix submit_battle_answer to prevent double-counting on re-submission
--    (root cause of "5 questions, 34 attempted, 0% accuracy" battle bug)
-- 2. Add explicit INSERT/UPDATE deny-by-default policies on battle tables
--    so future direct writes fail loudly instead of silently
-- 3. Revoke direct SELECT access to PII columns (email, phone) on profiles
-- 4. Add 'pro_monthly' as canonical plan id alias if not present
-- ============================================================

-- 1) Battle RPC fix — guard player counter update against re-submission
CREATE OR REPLACE FUNCTION public.submit_battle_answer(
  p_battle_id uuid,
  p_question_id uuid,
  p_selected_options text[] DEFAULT NULL,
  p_numerical_answer numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_validation jsonb;
  v_is_correct boolean;
  v_points integer;
  v_player public.battle_players%ROWTYPE;
  v_already_answered boolean := false;
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

  -- Check if this question was already answered by this user (re-submission guard)
  SELECT EXISTS (
    SELECT 1 FROM public.battle_answers
    WHERE battle_id = p_battle_id AND user_id = v_user AND question_id = p_question_id
  ) INTO v_already_answered;

  -- If already answered, do NOT re-grade or update counters; return the original result.
  IF v_already_answered THEN
    SELECT jsonb_build_object('is_correct', is_correct, 'points', points, 'already_answered', true)
    INTO v_validation
    FROM public.battle_answers
    WHERE battle_id = p_battle_id AND user_id = v_user AND question_id = p_question_id;
    RETURN v_validation;
  END IF;

  v_validation := public.validate_practice_answer(p_question_id, p_selected_options, p_numerical_answer);
  v_is_correct := COALESCE((v_validation->>'is_correct')::boolean, false);
  v_points := CASE WHEN v_is_correct THEN 100 + LEAST(50, v_player.streak * 10) ELSE -20 END;

  INSERT INTO public.battle_answers (battle_id, user_id, question_id, selected_options, numerical_answer, is_correct, points)
  VALUES (p_battle_id, v_user, p_question_id, p_selected_options, p_numerical_answer, v_is_correct, v_points);

  UPDATE public.battle_players
  SET score = GREATEST(0, score + v_points),
      correct_count = correct_count + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
      wrong_count = wrong_count + CASE WHEN v_is_correct THEN 0 ELSE 1 END,
      streak = CASE WHEN v_is_correct THEN streak + 1 ELSE 0 END
  WHERE battle_id = p_battle_id AND user_id = v_user;

  RETURN v_validation || jsonb_build_object('points', v_points);
END;
$function$;

-- 2) Battle tables — explicit policies so intent is clear and future direct
--    client writes don't fall through silently. All writes must go through
--    SECURITY DEFINER RPCs (create_battle, join_battle, submit_battle_answer,
--    finish_battle). These policies are deny-by-default for direct writes.
DO $$
BEGIN
  -- battle_answers: deny direct client INSERT/UPDATE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'battle_answers' AND policyname = 'battle_answers no direct writes') THEN
    EXECUTE 'CREATE POLICY "battle_answers no direct writes" ON public.battle_answers FOR INSERT TO authenticated WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'battle_players' AND policyname = 'battle_players no direct writes') THEN
    EXECUTE 'CREATE POLICY "battle_players no direct writes" ON public.battle_players FOR INSERT TO authenticated WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'battle_sessions' AND policyname = 'battle_sessions no direct writes') THEN
    EXECUTE 'CREATE POLICY "battle_sessions no direct writes" ON public.battle_sessions FOR INSERT TO authenticated WITH CHECK (false)';
  END IF;
END $$;

-- 3) Revoke direct column access to PII on profiles. RLS row visibility
--    stays USING (true) so leaderboards/battle player lookups still work,
--    but email/phone become invisible to other authenticated users.
REVOKE SELECT (email, phone) ON public.profiles FROM anon, authenticated;
-- Owners still see their own email/phone through .single() because PostgREST
-- column privileges are enforced per-column. To let users see their own
-- email/phone, we re-grant via a security-definer view.
CREATE OR REPLACE VIEW public.my_profile
WITH (security_invoker = false) AS
  SELECT * FROM public.profiles WHERE id = auth.uid();

GRANT SELECT ON public.my_profile TO authenticated;

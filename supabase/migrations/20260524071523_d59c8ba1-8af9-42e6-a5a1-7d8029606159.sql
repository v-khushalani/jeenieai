
-- ============================================================
-- 1) REFERRALS: hide referred_email from referrer
-- ============================================================
CREATE OR REPLACE VIEW public.referrals_safe
WITH (security_invoker=on) AS
SELECT id, referrer_id, referred_id, status, reward_granted, created_at, updated_at
FROM public.referrals;

GRANT SELECT ON public.referrals_safe TO authenticated;

-- Block client read of the email column. Service role bypasses GRANTS for admins/edge functions.
REVOKE SELECT (referred_email) ON public.referrals FROM authenticated;
REVOKE SELECT (referred_email) ON public.referrals FROM anon;

-- ============================================================
-- 2) DAILY_PROGRESS: route writes through SECURITY DEFINER RPCs
-- ============================================================

-- Server-controlled per-answer sync. Caps point delta defensively.
CREATE OR REPLACE FUNCTION public.sync_daily_progress(
  p_user_id   uuid,
  p_is_correct boolean,
  p_points_delta integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_goal int;
  v_points int := GREATEST(0, LEAST(COALESCE(p_points_delta, 0), 100));
  v_row daily_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COALESCE(daily_goal, 15) INTO v_goal FROM profiles WHERE id = p_user_id;
  IF v_goal IS NULL THEN v_goal := 15; END IF;

  SELECT * INTO v_row
  FROM daily_progress
  WHERE user_id = p_user_id AND date = v_today
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE daily_progress
    SET questions_completed = COALESCE(questions_completed,0) + 1,
        questions_attempted = COALESCE(questions_attempted,0) + 1,
        questions_correct   = COALESCE(questions_correct,0) + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        points_earned       = COALESCE(points_earned,0) + v_points,
        daily_target        = v_goal,
        target_met          = (COALESCE(questions_completed,0) + 1) >= v_goal,
        updated_at          = now()
    WHERE id = v_row.id;
  ELSE
    INSERT INTO daily_progress (user_id, date, questions_completed, questions_attempted, questions_correct, points_earned, daily_target, target_met)
    VALUES (p_user_id, v_today, 1, 1, CASE WHEN p_is_correct THEN 1 ELSE 0 END, v_points, v_goal, 1 >= v_goal);
  END IF;

  RETURN jsonb_build_object('success', true, 'date', v_today);
END;
$$;

-- Ensure today's row exists with a target (used by streak loader)
CREATE OR REPLACE FUNCTION public.ensure_daily_progress(
  p_user_id uuid,
  p_daily_target integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_target int;
  v_profile_goal int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT COALESCE(daily_goal, 15) INTO v_profile_goal FROM profiles WHERE id = p_user_id;
  v_target := GREATEST(COALESCE(p_daily_target, 15), COALESCE(v_profile_goal, 15));

  INSERT INTO daily_progress (user_id, date, daily_target, questions_completed, target_met)
  VALUES (p_user_id, v_today, v_target, 0, false)
  ON CONFLICT (user_id, date) DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Update 7-day rolling accuracy (server-validated; client supplies value)
CREATE OR REPLACE FUNCTION public.update_daily_accuracy(
  p_user_id uuid,
  p_accuracy numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_acc numeric := GREATEST(0, LEAST(COALESCE(p_accuracy, 0), 100));
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  INSERT INTO daily_progress (user_id, date, accuracy_7day)
  VALUES (p_user_id, v_today, v_acc)
  ON CONFLICT (user_id, date) DO UPDATE
  SET accuracy_7day = EXCLUDED.accuracy_7day,
      updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Add unique constraint required by ON CONFLICT above (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'daily_progress_user_date_unique'
  ) THEN
    -- Deduplicate first to avoid constraint failure
    DELETE FROM daily_progress a
    USING daily_progress b
    WHERE a.user_id = b.user_id
      AND a.date = b.date
      AND a.ctid < b.ctid;

    ALTER TABLE daily_progress
      ADD CONSTRAINT daily_progress_user_date_unique UNIQUE (user_id, date);
  END IF;
END$$;

-- Lock down user-facing policies: SELECT only; writes go through RPCs above
DROP POLICY IF EXISTS "Users can manage their own daily progress" ON public.daily_progress;

CREATE POLICY "Users can view own daily progress"
  ON public.daily_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all daily progress"
  ON public.daily_progress
  FOR SELECT
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- Allow function execution (functions enforce auth.uid() inside)
GRANT EXECUTE ON FUNCTION public.sync_daily_progress(uuid, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_daily_progress(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_daily_accuracy(uuid, numeric) TO authenticated;

-- Challenge Engine RPCs (JEEnie Points only)

CREATE OR REPLACE FUNCTION public.award_mission_points(p_mission_id uuid, p_block_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_blocks jsonb;
  v_block jsonb;
  v_points int := 0;
  v_ref text := p_mission_id::text || ':' || p_block_id;
  v_total int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  SELECT blocks INTO v_blocks FROM public.daily_missions
  WHERE id = p_mission_id AND user_id = v_uid;
  IF v_blocks IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'mission_not_found'); END IF;

  SELECT b INTO v_block FROM jsonb_array_elements(v_blocks) b
  WHERE b->>'id' = p_block_id LIMIT 1;
  IF v_block IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'block_not_found'); END IF;

  IF COALESCE(v_block->'progress'->>'status', 'pending') <> 'done' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'block_not_done');
  END IF;

  IF EXISTS (SELECT 1 FROM public.points_log WHERE user_id = v_uid AND reference_id = v_ref) THEN
    RETURN jsonb_build_object('ok', true, 'points', 0, 'already_claimed', true);
  END IF;

  v_points := GREATEST(0, LEAST(500, COALESCE((v_block->>'xp_reward')::int, 20)));

  INSERT INTO public.points_log (user_id, action_type, points, description, reference_id)
  VALUES (v_uid, 'mission_block', v_points, COALESCE(v_block->>'title', 'Challenge complete'), v_ref);

  UPDATE public.profiles
  SET total_points = COALESCE(total_points, 0) + v_points
  WHERE id = v_uid
  RETURNING total_points INTO v_total;

  RETURN jsonb_build_object('ok', true, 'points', v_points, 'total_points', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_vault()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_blocks jsonb;
  v_done int;
  v_total int;
  v_roll numeric;
  v_rarity text;
  v_type text;
  v_points int;
  v_payload jsonb;
  v_new_total int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  IF EXISTS (SELECT 1 FROM public.reward_vault_claims WHERE user_id = v_uid AND claim_date = v_today) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  SELECT blocks INTO v_blocks FROM public.daily_missions
  WHERE user_id = v_uid AND mission_date = v_today;
  IF v_blocks IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'chain_incomplete'); END IF;

  SELECT count(*) FILTER (WHERE COALESCE(b->'progress'->>'status','pending') = 'done'), count(*)
  INTO v_done, v_total FROM jsonb_array_elements(v_blocks) b;

  IF v_total = 0 OR v_done < v_total THEN
    RETURN jsonb_build_object('ok', false, 'error', 'chain_incomplete');
  END IF;

  v_roll := random();
  IF v_roll < 0.55 THEN
    v_rarity := 'common'; v_type := 'points'; v_points := 25 + floor(random()*26)::int;
    v_payload := jsonb_build_object('label', '+' || v_points || ' JEEnie Points');
  ELSIF v_roll < 0.83 THEN
    v_rarity := 'rare'; v_type := 'points'; v_points := 75 + floor(random()*51)::int;
    v_payload := jsonb_build_object('label', '+' || v_points || ' JEEnie Points');
  ELSIF v_roll < 0.96 THEN
    v_rarity := 'epic'; v_type := 'streak_freeze'; v_points := 50;
    v_payload := jsonb_build_object('label', 'Streak Freeze', 'code', 'streak_freeze');
  ELSE
    v_rarity := 'legendary'; v_type := 'title'; v_points := 150;
    v_payload := jsonb_build_object('label', 'Title: Chain Breaker', 'code', 'chain_breaker');
  END IF;

  INSERT INTO public.reward_vault_claims (user_id, claim_date, reward_type, rarity, points_awarded, payload)
  VALUES (v_uid, v_today, v_type, v_rarity, v_points, v_payload);

  IF v_type <> 'points' THEN
    INSERT INTO public.user_inventory (user_id, item_type, item_code, label, quantity)
    VALUES (v_uid, v_type, v_payload->>'code', v_payload->>'label', 1)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.points_log (user_id, action_type, points, description, reference_id)
  VALUES (v_uid, 'daily_vault', v_points, 'Daily Vault (' || v_rarity || ')', 'vault:' || v_today::text);

  UPDATE public.profiles SET total_points = COALESCE(total_points,0) + v_points
  WHERE id = v_uid RETURNING total_points INTO v_new_total;

  RETURN jsonb_build_object('ok', true, 'rarity', v_rarity, 'reward_type', v_type,
    'points', v_points, 'payload', v_payload, 'total_points', v_new_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_contract(p_target_questions int, p_target_accuracy int, p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_q int := GREATEST(20, LEAST(1000, COALESCE(p_target_questions, 100)));
  v_a int := GREATEST(30, LEAST(95, COALESCE(p_target_accuracy, 60)));
  v_d int := GREATEST(3, LEAST(14, COALESCE(p_days, 7)));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  IF EXISTS (SELECT 1 FROM public.user_contracts
             WHERE user_id = v_uid AND status = 'active' AND ends_on >= v_today) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_contract_exists');
  END IF;

  INSERT INTO public.user_contracts (user_id, kind, target_questions, target_accuracy, reward_points, starts_on, ends_on, status)
  VALUES (v_uid, 'weekly', v_q, v_a, v_q * 2, v_today, v_today + v_d, 'active')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'contract_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_contract_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  c public.user_contracts%ROWTYPE;
  v_attempted int := 0;
  v_correct int := 0;
  v_span int;
  v_elapsed int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  SELECT * INTO c FROM public.user_contracts
  WHERE user_id = v_uid AND status = 'active' AND ends_on >= v_today
  ORDER BY created_at DESC LIMIT 1;

  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'contract', NULL); END IF;

  SELECT count(*), count(*) FILTER (WHERE is_correct)
  INTO v_attempted, v_correct
  FROM public.question_attempts
  WHERE user_id = v_uid
    AND COALESCE(mode, 'practice') <> 'test'
    AND (attempted_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN c.starts_on AND c.ends_on;

  v_span := GREATEST(1, (c.ends_on - c.starts_on));
  v_elapsed := GREATEST(1, LEAST(v_span, (v_today - c.starts_on) + 1));

  RETURN jsonb_build_object('ok', true, 'contract', jsonb_build_object(
    'id', c.id,
    'target_questions', c.target_questions,
    'target_accuracy', c.target_accuracy,
    'reward_points', c.reward_points,
    'starts_on', c.starts_on,
    'ends_on', c.ends_on,
    'status', c.status,
    'attempted', v_attempted,
    'accuracy', CASE WHEN v_attempted > 0 THEN round((v_correct::numeric / v_attempted) * 100) ELSE 0 END,
    'expected_by_now', ceil(c.target_questions::numeric * v_elapsed / v_span)::int,
    'days_left', GREATEST(0, c.ends_on - v_today)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.award_mission_points(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_daily_vault() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sign_contract(int, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_contract_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_mission_points(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_vault() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract(int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contract_status() TO authenticated;
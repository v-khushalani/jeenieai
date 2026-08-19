
-- ============ CONTRACTS ============
CREATE TABLE IF NOT EXISTS public.user_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'weekly',
  target_questions integer NOT NULL DEFAULT 100,
  target_accuracy integer NOT NULL DEFAULT 60,
  reward_points integer NOT NULL DEFAULT 500,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date NOT NULL DEFAULT (CURRENT_DATE + 7),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_contracts TO authenticated;
GRANT ALL ON public.user_contracts TO service_role;
ALTER TABLE public.user_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own contracts" ON public.user_contracts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_user_contracts_user ON public.user_contracts(user_id, status);

-- ============ VAULT ============
CREATE TABLE IF NOT EXISTS public.reward_vault_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  reward_type text NOT NULL,
  rarity text NOT NULL DEFAULT 'common',
  points_awarded integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date)
);
GRANT SELECT ON public.reward_vault_claims TO authenticated;
GRANT ALL ON public.reward_vault_claims TO service_role;
ALTER TABLE public.reward_vault_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vault claims" ON public.reward_vault_claims FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============ INVENTORY ============
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  item_code text NOT NULL,
  label text,
  quantity integer NOT NULL DEFAULT 1,
  equipped boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_code)
);
GRANT SELECT, UPDATE ON public.user_inventory TO authenticated;
GRANT ALL ON public.user_inventory TO service_role;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inventory read" ON public.user_inventory FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own inventory equip" ON public.user_inventory FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ AWARD MISSION POINTS ============
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
  v_points integer;
  v_ref text;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT blocks INTO v_blocks FROM daily_missions WHERE id = p_mission_id AND user_id = v_uid;
  IF v_blocks IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'mission_not_found'); END IF;

  SELECT b INTO v_block FROM jsonb_array_elements(v_blocks) b WHERE b->>'id' = p_block_id;
  IF v_block IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'block_not_found'); END IF;

  IF COALESCE(v_block->'progress'->>'status', 'pending') <> 'done' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'block_not_done');
  END IF;

  v_ref := 'mission_block:' || p_block_id;
  IF EXISTS (SELECT 1 FROM points_log WHERE user_id = v_uid AND reference_id = v_ref) THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true, 'points', 0);
  END IF;

  v_points := GREATEST(0, LEAST(500, COALESCE((v_block->>'xp_reward')::int, 50)));

  INSERT INTO points_log (user_id, action_type, points, description, reference_id)
  VALUES (v_uid, 'mission_block', v_points, COALESCE(v_block->>'title', 'Mission block'), v_ref);

  UPDATE profiles SET total_points = COALESCE(total_points, 0) + v_points, updated_at = now()
  WHERE id = v_uid
  RETURNING total_points INTO v_total;

  RETURN jsonb_build_object('ok', true, 'points', v_points, 'total_points', v_total);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_mission_points(uuid, text) TO authenticated;

-- ============ DAILY VAULT ============
CREATE OR REPLACE FUNCTION public.claim_daily_vault()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_mission daily_missions%ROWTYPE;
  v_total_blocks int;
  v_done_blocks int;
  v_roll numeric;
  v_rarity text;
  v_type text;
  v_points int := 0;
  v_label text;
  v_code text;
  v_existing reward_vault_claims%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT * INTO v_existing FROM reward_vault_claims WHERE user_id = v_uid AND claim_date = v_today;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true,
      'reward_type', v_existing.reward_type, 'rarity', v_existing.rarity,
      'points', v_existing.points_awarded, 'payload', v_existing.payload);
  END IF;

  SELECT * INTO v_mission FROM daily_missions WHERE user_id = v_uid AND mission_date = v_today;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_mission'); END IF;

  SELECT count(*), count(*) FILTER (WHERE COALESCE(b->'progress'->>'status','pending') = 'done')
  INTO v_total_blocks, v_done_blocks
  FROM jsonb_array_elements(v_mission.blocks) b;

  IF v_total_blocks = 0 OR v_done_blocks < v_total_blocks THEN
    RETURN jsonb_build_object('ok', false, 'error', 'chain_incomplete',
      'done', v_done_blocks, 'total', v_total_blocks);
  END IF;

  v_roll := random();
  IF v_roll < 0.55 THEN
    v_rarity := 'common'; v_type := 'points'; v_points := 100;
    v_label := '+100 JEEnie Points';
  ELSIF v_roll < 0.80 THEN
    v_rarity := 'rare'; v_type := 'points'; v_points := 250;
    v_label := '+250 JEEnie Points';
  ELSIF v_roll < 0.93 THEN
    v_rarity := 'epic'; v_type := 'streak_freeze'; v_points := 50;
    v_code := 'streak_freeze'; v_label := 'Streak Freeze';
  ELSE
    v_rarity := 'legendary'; v_type := 'title'; v_points := 300;
    v_code := 'title_unstoppable'; v_label := 'Title: Unstoppable';
  END IF;

  IF v_code IS NOT NULL THEN
    INSERT INTO user_inventory (user_id, item_type, item_code, label, quantity)
    VALUES (v_uid, v_type, v_code, v_label, 1)
    ON CONFLICT (user_id, item_code)
    DO UPDATE SET quantity = user_inventory.quantity + 1;
  END IF;

  IF v_points > 0 THEN
    INSERT INTO points_log (user_id, action_type, points, description, reference_id)
    VALUES (v_uid, 'daily_vault', v_points, 'Daily Vault — ' || v_rarity, 'vault:' || v_today::text);
    UPDATE profiles SET total_points = COALESCE(total_points, 0) + v_points, updated_at = now()
    WHERE id = v_uid;
  END IF;

  INSERT INTO reward_vault_claims (user_id, claim_date, reward_type, rarity, points_awarded, payload)
  VALUES (v_uid, v_today, v_type, v_rarity, v_points,
    jsonb_build_object('label', v_label, 'code', v_code));

  RETURN jsonb_build_object('ok', true, 'reward_type', v_type, 'rarity', v_rarity,
    'points', v_points, 'payload', jsonb_build_object('label', v_label, 'code', v_code));
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_daily_vault() TO authenticated;

-- ============ CONTRACTS: SIGN + STATUS ============
CREATE OR REPLACE FUNCTION public.sign_contract(p_target_questions integer, p_target_accuracy integer, p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_q int := GREATEST(20, LEAST(2000, COALESCE(p_target_questions, 100)));
  v_a int := GREATEST(30, LEAST(95, COALESCE(p_target_accuracy, 60)));
  v_d int := GREATEST(3, LEAST(30, COALESCE(p_days, 7)));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  UPDATE user_contracts SET status = 'expired', updated_at = now()
  WHERE user_id = v_uid AND status = 'active' AND ends_on < v_today;

  IF EXISTS (SELECT 1 FROM user_contracts WHERE user_id = v_uid AND status = 'active') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'active_contract_exists');
  END IF;

  INSERT INTO user_contracts (user_id, kind, target_questions, target_accuracy, reward_points, starts_on, ends_on)
  VALUES (v_uid, 'weekly', v_q, v_a, v_q * 5, v_today, v_today + v_d)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'contract_id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.sign_contract(integer, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_contract_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_c user_contracts%ROWTYPE;
  v_attempted int := 0;
  v_correct int := 0;
  v_acc int := 0;
  v_days_total int;
  v_days_done int;
  v_expected int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthorized'); END IF;

  SELECT * INTO v_c FROM user_contracts
  WHERE user_id = v_uid AND status = 'active'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'contract', null); END IF;

  SELECT count(*), count(*) FILTER (WHERE is_correct)
  INTO v_attempted, v_correct
  FROM question_attempts
  WHERE user_id = v_uid
    AND COALESCE(mode, 'practice') <> 'test'
    AND attempted_at >= v_c.starts_on::timestamptz;

  v_acc := CASE WHEN v_attempted > 0 THEN round((v_correct::numeric / v_attempted) * 100) ELSE 0 END;
  v_days_total := GREATEST(1, (v_c.ends_on - v_c.starts_on));
  v_days_done := GREATEST(0, LEAST(v_days_total, (v_today - v_c.starts_on)));
  v_expected := round(v_c.target_questions::numeric * v_days_done / v_days_total);

  -- finalize when expired
  IF v_today > v_c.ends_on THEN
    UPDATE user_contracts
      SET status = CASE WHEN v_attempted >= v_c.target_questions AND v_acc >= v_c.target_accuracy
                        THEN 'completed' ELSE 'failed' END,
          updated_at = now()
    WHERE id = v_c.id;

    IF v_attempted >= v_c.target_questions AND v_acc >= v_c.target_accuracy
       AND NOT EXISTS (SELECT 1 FROM points_log WHERE user_id = v_uid AND reference_id = 'contract:' || v_c.id::text) THEN
      INSERT INTO points_log (user_id, action_type, points, description, reference_id)
      VALUES (v_uid, 'contract_complete', v_c.reward_points, 'Contract completed', 'contract:' || v_c.id::text);
      UPDATE profiles SET total_points = COALESCE(total_points,0) + v_c.reward_points, updated_at = now()
      WHERE id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'contract', jsonb_build_object(
      'id', v_c.id,
      'target_questions', v_c.target_questions,
      'target_accuracy', v_c.target_accuracy,
      'reward_points', v_c.reward_points,
      'starts_on', v_c.starts_on,
      'ends_on', v_c.ends_on,
      'status', v_c.status,
      'attempted', v_attempted,
      'accuracy', v_acc,
      'expected_by_now', v_expected,
      'days_left', GREATEST(0, v_c.ends_on - v_today)
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_contract_status() TO authenticated;

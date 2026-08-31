-- JEEnie Rewards System (run once in the Supabase SQL editor)
-- Creates: points store, purchases, claims, monthly draw entries + secure RPCs.

CREATE TABLE IF NOT EXISTS public.reward_store_items (
  code text PRIMARY KEY,
  label text NOT NULL,
  description text,
  item_type text NOT NULL,
  cost_points integer NOT NULL,
  min_tier text NOT NULL DEFAULT 'free',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reward_store_items TO anon;
GRANT SELECT ON public.reward_store_items TO authenticated;
GRANT ALL ON public.reward_store_items TO service_role;
ALTER TABLE public.reward_store_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store items readable" ON public.reward_store_items;
CREATE POLICY "store items readable" ON public.reward_store_items FOR SELECT USING (is_active);
DROP POLICY IF EXISTS "admins manage store items" ON public.reward_store_items;
CREATE POLICY "admins manage store items" ON public.reward_store_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.reward_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_code text NOT NULL,
  cost_points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reward_purchases TO authenticated;
GRANT ALL ON public.reward_purchases TO service_role;
ALTER TABLE public.reward_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own purchases" ON public.reward_purchases;
CREATE POLICY "own purchases" ON public.reward_purchases FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  claim_kind text NOT NULL,
  claim_key text NOT NULL,
  reward_label text NOT NULL,
  points_awarded integer NOT NULL DEFAULT 0,
  requires_shipping boolean NOT NULL DEFAULT false,
  fulfilment_status text NOT NULL DEFAULT 'none',
  shipping_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_kind, claim_key)
);
GRANT SELECT ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own claims" ON public.reward_claims;
CREATE POLICY "own claims" ON public.reward_claims FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admins read claims" ON public.reward_claims;
CREATE POLICY "admins read claims" ON public.reward_claims FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins update claims" ON public.reward_claims;
CREATE POLICY "admins update claims" ON public.reward_claims FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.draw_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cycle_month text NOT NULL,
  source text NOT NULL,
  tickets integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.draw_entries TO authenticated;
GRANT ALL ON public.draw_entries TO service_role;
ALTER TABLE public.draw_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own entries" ON public.draw_entries;
CREATE POLICY "own entries" ON public.draw_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admins read entries" ON public.draw_entries;
CREATE POLICY "admins read entries" ON public.draw_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_draw_entries_cycle ON public.draw_entries (cycle_month, user_id);
CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON public.reward_claims (user_id, claim_kind);

CREATE OR REPLACE FUNCTION public.points_multiplier(_tier text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _tier WHEN 'pro' THEN 1.5 WHEN 'pro_plus' THEN 2.0 ELSE 1.0 END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_store_item(p_item_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item public.reward_store_items%ROWTYPE;
  v_points integer;
  v_tier text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'auth_required'); END IF;

  SELECT * INTO v_item FROM public.reward_store_items WHERE code = p_item_code AND is_active;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'item_not_found'); END IF;

  SELECT total_points, subscription_tier INTO v_points, v_tier FROM public.profiles WHERE id = v_user;
  IF v_item.min_tier = 'pro' AND COALESCE(v_tier, 'free') NOT IN ('pro','pro_plus') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tier_locked');
  END IF;
  IF v_item.min_tier = 'pro_plus' AND COALESCE(v_tier, 'free') <> 'pro_plus' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tier_locked');
  END IF;
  IF COALESCE(v_points, 0) < v_item.cost_points THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_points', 'needed', v_item.cost_points);
  END IF;

  UPDATE public.profiles SET total_points = total_points - v_item.cost_points WHERE id = v_user
    RETURNING total_points INTO v_points;

  INSERT INTO public.reward_purchases (user_id, item_code, cost_points)
  VALUES (v_user, v_item.code, v_item.cost_points);

  IF v_item.item_type = 'draw_ticket' THEN
    INSERT INTO public.draw_entries (user_id, cycle_month, source, tickets)
    VALUES (v_user, to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM'), 'points', 1);
  ELSE
    INSERT INTO public.user_inventory (user_id, item_type, item_code, label, quantity)
    VALUES (v_user, v_item.item_type, v_item.code, v_item.label, 1)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'total_points', v_points, 'item', v_item.label);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_weekly_reward(p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_week_start date := date_trunc('week', timezone('Asia/Kolkata', now()))::date;
  v_active integer;
  v_key text;
  v_points integer := 0;
  v_label text;
  v_tier text;
  v_total integer;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'auth_required'); END IF;
  IF p_days NOT IN (3, 5, 7) THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_tier'); END IF;

  SELECT count(*) INTO v_active FROM public.daily_progress
   WHERE user_id = v_user AND date >= v_week_start AND COALESCE(questions_attempted, 0) > 0;

  IF v_active < p_days THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_eligible', 'active_days', v_active);
  END IF;

  v_key := v_week_start::text || ':' || p_days::text;
  SELECT subscription_tier INTO v_tier FROM public.profiles WHERE id = v_user;

  IF p_days = 3 THEN
    v_points := (100 * public.points_multiplier(v_tier))::int; v_label := 'Weekly bonus points';
  ELSIF p_days = 5 THEN
    v_label := 'Streak shield';
  ELSE
    v_label := 'Monthly draw entry';
  END IF;

  BEGIN
    INSERT INTO public.reward_claims (user_id, claim_kind, claim_key, reward_label, points_awarded)
    VALUES (v_user, 'weekly', v_key, v_label, v_points);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END;

  IF p_days = 3 THEN
    UPDATE public.profiles SET total_points = COALESCE(total_points, 0) + v_points
     WHERE id = v_user RETURNING total_points INTO v_total;
  ELSIF p_days = 5 THEN
    INSERT INTO public.user_inventory (user_id, item_type, item_code, label, quantity)
    VALUES (v_user, 'streak_freeze', 'streak_shield', 'Streak Shield', 1)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.draw_entries (user_id, cycle_month, source, tickets)
    VALUES (v_user, to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM'), 'weekly_streak', 1);
  END IF;

  RETURN jsonb_build_object('ok', true, 'label', v_label, 'points', v_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_streak_milestone(p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_streak integer;
  v_label text;
  v_ship boolean := false;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'auth_required'); END IF;
  IF p_days NOT IN (7, 30, 100, 180, 365) THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_tier'); END IF;

  SELECT GREATEST(COALESCE(longest_streak, 0), COALESCE(current_streak, 0)) INTO v_streak
    FROM public.profiles WHERE id = v_user;
  IF v_streak < p_days THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_eligible', 'streak', v_streak);
  END IF;

  v_label := CASE p_days
    WHEN 7 THEN 'Consistency badge'
    WHEN 30 THEN '1 month Pro'
    WHEN 100 THEN 'Merch unlock: sticker pack + notebook'
    WHEN 180 THEN 'Premium merch unlock'
    ELSE 'Grand draw entry' END;
  v_ship := p_days IN (100, 180);

  BEGIN
    INSERT INTO public.reward_claims (user_id, claim_kind, claim_key, reward_label, requires_shipping, fulfilment_status)
    VALUES (v_user, 'milestone', p_days::text, v_label, v_ship, CASE WHEN v_ship THEN 'pending' ELSE 'none' END);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END;

  IF p_days = 365 THEN
    INSERT INTO public.draw_entries (user_id, cycle_month, source, tickets)
    VALUES (v_user, to_char(timezone('Asia/Kolkata', now()), 'YYYY-MM'), 'streak_365', 5);
  END IF;

  RETURN jsonb_build_object('ok', true, 'label', v_label, 'requires_shipping', v_ship);
END;
$$;

INSERT INTO public.reward_store_items (code, label, description, item_type, cost_points, min_tier, sort_order) VALUES
  ('streak_freeze', 'Streak Freeze', 'Ek din miss karo, streak bachi rahegi', 'streak_freeze', 300, 'free', 1),
  ('draw_ticket', 'Monthly Draw Ticket', 'Ek entry is mahine ke draw mein', 'draw_ticket', 500, 'free', 2),
  ('avatar_frame_gold', 'Gold Avatar Frame', 'Leaderboard pe alag dikho', 'cosmetic', 800, 'free', 3),
  ('pyq_pack', 'PYQ Power Pack', 'Extra previous-year question set', 'unlock', 1000, 'free', 4),
  ('mock_unlock', 'Extra Mock Test', 'Ek additional full mock', 'unlock', 1200, 'free', 5),
  ('pro_trial_week', '1 Week Pro Trial', 'Pro features 7 din ke liye', 'trial', 2500, 'free', 6)
ON CONFLICT (code) DO NOTHING;

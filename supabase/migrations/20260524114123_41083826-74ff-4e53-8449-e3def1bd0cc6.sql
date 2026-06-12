
-- ============================================================
-- 1. subscription_plans
-- ============================================================
CREATE TABLE public.subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  tagline text,
  tier text NOT NULL CHECK (tier IN ('pro', 'pro_plus')),
  mrp_price numeric,
  price numeric NOT NULL,
  duration_days int NOT NULL,
  display_duration text NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_popular boolean NOT NULL DEFAULT false,
  is_best_value boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  razorpay_plan_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads active subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage subscription plans"
  ON public.subscription_plans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_subscription_plans_updated
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.subscription_plans (id, name, tagline, tier, mrp_price, price, duration_days, display_duration, features, is_popular, is_best_value, display_order, razorpay_plan_id) VALUES
  ('monthly', 'JEEnie Pro', 'Try Pro for a month.', 'pro', NULL, 199, 30, 'per month',
    '["Unlimited practice questions","Unlimited mock tests","PYQs (last 5 years)","AI Doubt Solver — 30/day","AI Study Planner","Full leaderboard & badges","Priority email support"]'::jsonb,
    false, false, 1, NULL),
  ('yearly', 'JEEnie Pro', 'Best value for solo prep.', 'pro', 1499, 899, 365, 'per year',
    '["Everything in Pro monthly","Save 40% vs MRP","PYQs (last 5 years)","AI Doubt Solver — 30/day","AI Study Planner","Effective ₹75/month","Priority email support"]'::jsonb,
    true, true, 2, NULL),
  ('pro_plus_monthly', 'JEEnie Pro+', 'Premium with AI rank predictor.', 'pro_plus', NULL, 349, 30, 'per month',
    '["Everything in Pro","PYQs — 10+ years all sessions","AI Doubt Solver — 100/day","Adaptive AI Study Planner","AI Rank Predictor","Educator PPTs & simulations","WhatsApp priority support"]'::jsonb,
    false, false, 3, NULL),
  ('pro_plus_yearly', 'JEEnie Pro+', 'Top 10% serious aspirants.', 'pro_plus', 2999, 1799, 365, 'per year',
    '["Everything in Pro+ monthly","Save 40% vs MRP","PYQs — 10+ years all sessions","AI Doubt Solver — 100/day","Adaptive AI Study Planner","AI Rank Predictor","Educator PPTs & simulations","Effective ₹150/month","WhatsApp priority support","Early access to new features"]'::jsonb,
    true, true, 4, NULL);

-- ============================================================
-- 2. promo_codes
-- ============================================================
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  applicable_plan_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_redemptions int,
  current_redemptions int NOT NULL DEFAULT 0,
  max_per_user int NOT NULL DEFAULT 1,
  min_amount numeric NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Authenticated users can SELECT active codes (needed for client-side preview/validation)
CREATE POLICY "Authenticated read active promo codes"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage promo codes"
  ON public.promo_codes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_promo_codes_updated
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Normalize code to uppercase on insert/update
CREATE OR REPLACE FUNCTION public.normalize_promo_code()
RETURNS TRIGGER AS $$
BEGIN NEW.code = upper(trim(NEW.code)); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_promo_codes_normalize
  BEFORE INSERT OR UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.normalize_promo_code();

-- Seed
INSERT INTO public.promo_codes (code, description, discount_type, discount_value, applicable_plan_ids, max_redemptions, max_per_user, expires_at, is_active) VALUES
  ('FOUNDER50', 'First 50 users — 45% off launch price', 'percent', 45, ARRAY[]::text[], 50, 1, now() + interval '30 days', true),
  ('JEE25', 'Always-on welcome discount', 'percent', 25, ARRAY[]::text[], NULL, 1, NULL, true);

-- ============================================================
-- 3. promo_redemptions
-- ============================================================
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  plan_id text NOT NULL,
  discount_applied numeric NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_redemptions_user ON public.promo_redemptions(user_id);
CREATE INDEX idx_promo_redemptions_code ON public.promo_redemptions(promo_code_id);

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own redemptions"
  ON public.promo_redemptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all redemptions"
  ON public.promo_redemptions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage redemptions"
  ON public.promo_redemptions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ============================================================
-- 4. validate_promo_code function
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_code text,
  p_plan_id text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code   public.promo_codes%ROWTYPE;
  v_plan   public.subscription_plans%ROWTYPE;
  v_user_uses int;
  v_discount numeric;
  v_final numeric;
BEGIN
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Plan not found');
  END IF;

  SELECT * INTO v_code FROM public.promo_codes WHERE code = upper(trim(p_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid promo code');
  END IF;

  IF NOT v_code.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is no longer active');
  END IF;

  IF v_code.starts_at IS NOT NULL AND v_code.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is not active yet');
  END IF;

  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code has expired');
  END IF;

  IF v_code.max_redemptions IS NOT NULL AND v_code.current_redemptions >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code has been fully redeemed');
  END IF;

  IF array_length(v_code.applicable_plan_ids, 1) > 0 AND NOT (p_plan_id = ANY (v_code.applicable_plan_ids)) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This code is not valid for the selected plan');
  END IF;

  IF v_code.min_amount > 0 AND v_plan.price < v_code.min_amount THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Plan price below minimum for this code');
  END IF;

  SELECT count(*) INTO v_user_uses FROM public.promo_redemptions
    WHERE promo_code_id = v_code.id AND user_id = p_user_id;
  IF v_user_uses >= v_code.max_per_user THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You have already used this code');
  END IF;

  IF v_code.discount_type = 'percent' THEN
    v_discount := round(v_plan.price * v_code.discount_value / 100);
  ELSE
    v_discount := least(v_code.discount_value, v_plan.price);
  END IF;

  v_final := greatest(v_plan.price - v_discount, 1);

  RETURN jsonb_build_object(
    'valid', true,
    'promo_code_id', v_code.id,
    'code', v_code.code,
    'discount_type', v_code.discount_type,
    'discount_value', v_code.discount_value,
    'discount_applied', v_discount,
    'original_price', v_plan.price,
    'final_price', v_final
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, text, uuid) TO authenticated, anon, service_role;

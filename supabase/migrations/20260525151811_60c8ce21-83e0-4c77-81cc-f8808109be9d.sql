
-- 1. Add the column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
  CHECK (subscription_tier IN ('free','pro','pro_plus'));

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);

-- 2. Backfill from latest real paid plan (skip referral rewards)
WITH latest_paid AS (
  SELECT DISTINCT ON (p.user_id)
    p.user_id,
    sp.tier
  FROM public.payments p
  JOIN public.subscription_plans sp ON sp.id = p.plan_id
  WHERE p.status = 'paid'
    AND COALESCE((p.metadata->>'source'), '') <> 'referral_reward'
  ORDER BY p.user_id, p.created_at DESC
)
UPDATE public.profiles pr
SET subscription_tier = lp.tier
FROM latest_paid lp
WHERE pr.id = lp.user_id
  AND pr.is_premium = true
  AND (pr.subscription_end_date IS NULL OR pr.subscription_end_date > now());

-- 3. Ensure expired/non-premium users are 'free'
UPDATE public.profiles
SET subscription_tier = 'free'
WHERE is_premium = false OR subscription_end_date IS NULL OR subscription_end_date <= now();

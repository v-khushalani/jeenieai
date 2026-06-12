
-- =========================================================================
-- 1) PROFILES: restrict reads
-- =========================================================================
DROP POLICY IF EXISTS "users view profiles" ON public.profiles;

-- Own row: full access
CREATE POLICY "users view own profile full"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Admins: full access to all profiles
CREATE POLICY "admins view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Other authenticated users: can read non-sensitive columns of other profiles
-- via the leaderboard view (created below). We do NOT add a broad SELECT policy.
-- Make sure anon has zero access.
REVOKE ALL ON public.profiles FROM anon;

-- Public leaderboard view: only safe columns, no PII
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = true)
AS SELECT
  id,
  full_name,
  avatar_url,
  total_points,
  current_streak,
  longest_streak,
  total_questions_solved,
  overall_accuracy,
  level,
  level_progress,
  badges
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

-- Allow authenticated users to read the public columns from base table
-- (needed because the view defers to RLS with security_invoker)
CREATE POLICY "authenticated read public profile fields"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- IMPORTANT: The above re-enables broad SELECT. To actually restrict PII we
-- must rely on column-level revokes. Revoke email/phone from authenticated:
REVOKE SELECT (email, phone) ON public.profiles FROM authenticated;
REVOKE SELECT (email, phone) ON public.profiles FROM anon;

-- =========================================================================
-- 2) REFERRALS: drop the email column
-- =========================================================================
DROP VIEW IF EXISTS public.referrals_safe;
ALTER TABLE public.referrals DROP COLUMN IF EXISTS referred_email;

-- Recreate the safe view without that column
CREATE VIEW public.referrals_safe
WITH (security_invoker = true)
AS SELECT
  id, referrer_id, referred_user_id, referral_code,
  status, reward_granted, created_at, completed_at
FROM public.referrals;
GRANT SELECT ON public.referrals_safe TO authenticated;

-- =========================================================================
-- 3) REALTIME: remove admin/promo tables from broadcast
-- =========================================================================
ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_notifications;
ALTER PUBLICATION supabase_realtime DROP TABLE public.promo_codes;

-- =========================================================================
-- 4) topic_mastery: add write policies (own user)
-- =========================================================================
CREATE POLICY "users insert own mastery"
ON public.topic_mastery FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own mastery"
ON public.topic_mastery FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =========================================================================
-- 5) battle_rewards: add write policies (own user)
-- =========================================================================
CREATE POLICY "users insert own battle rewards"
ON public.battle_rewards FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own battle rewards"
ON public.battle_rewards FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

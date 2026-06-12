-- 1. topic_mastery: restrict to SELECT only (writes via upsert_topic_mastery RPC)
DROP POLICY IF EXISTS "Users manage own topic mastery" ON public.topic_mastery;
CREATE POLICY "Users view own topic mastery"
  ON public.topic_mastery FOR SELECT
  USING (auth.uid() = user_id);

-- 2. referrals.referred_email: revoke column read from authenticated
REVOKE SELECT (referred_email) ON public.referrals FROM authenticated;
REVOKE SELECT (referred_email) ON public.referrals FROM anon;

-- 3. promo_codes: remove broad authenticated read; only admins read full rows.
-- Validation goes through public.validate_promo_code (SECURITY DEFINER) which is fine.
DROP POLICY IF EXISTS "Authenticated read active promo codes" ON public.promo_codes;

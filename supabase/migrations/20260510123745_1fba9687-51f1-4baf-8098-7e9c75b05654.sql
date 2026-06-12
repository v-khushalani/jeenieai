
-- ============================================================
-- PHASE 2 SECURITY HARDENING
-- ============================================================

-- 1) Remove user_roles from realtime publication (role changes were broadcast to all auth users)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_roles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_roles';
  END IF;
END $$;

-- 2) user_badges: remove self-INSERT policy (privilege escalation: users could award any badge)
DROP POLICY IF EXISTS "Users insert own badges" ON public.user_badges;
-- Admins still manage via existing role check; create explicit admin INSERT policy
CREATE POLICY "Admins can grant badges"
ON public.user_badges
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Server-side function to award badges (callable from edge functions / triggers using service role)
CREATE OR REPLACE FUNCTION public.award_badge(_user_id uuid, _badge_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_points int;
  v_required int;
  v_user_points int;
BEGIN
  -- Verify badge exists and user meets points requirement
  SELECT points_required INTO v_required FROM public.badges WHERE id = _badge_id AND is_active = true;
  IF v_required IS NULL THEN
    RAISE EXCEPTION 'Badge not found or inactive';
  END IF;

  SELECT total_points INTO v_user_points FROM public.profiles WHERE id = _user_id;
  IF COALESCE(v_user_points, 0) < v_required THEN
    RAISE EXCEPTION 'User does not meet points requirement';
  END IF;

  INSERT INTO public.user_badges (user_id, badge_id)
  VALUES (_user_id, _badge_id)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.award_badge(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3) user_batch_subscriptions: remove self-INSERT (payment bypass)
DROP POLICY IF EXISTS "Users insert own subscriptions" ON public.user_batch_subscriptions;
-- Subscription creation must go through verify-payment edge function (uses service role)

-- 4) referrals: remove referred_email exposure to referrers
-- Drop view-by-referrer access to email column by replacing the SELECT policy with a column-restricted approach
-- Postgres RLS doesn't have column-level grants in the same statement; use a trigger to null out email after referral completes
-- Simpler: revoke select on referred_email column for authenticated, keep for service_role/admins
REVOKE SELECT (referred_email) ON public.referrals FROM authenticated, anon;

-- 5) referrals UPDATE: restrict columns users can modify (block reward_granted/status manipulation)
DROP POLICY IF EXISTS "Users update own referrals" ON public.referrals;
-- Trigger to prevent non-admin users from changing protected columns
CREATE OR REPLACE FUNCTION public.guard_referral_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.reward_granted IS DISTINCT FROM OLD.reward_granted
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.referrer_id IS DISTINCT FROM OLD.referrer_id
     OR NEW.referred_id IS DISTINCT FROM OLD.referred_id THEN
    RAISE EXCEPTION 'Cannot modify protected referral fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_referral_update_trg ON public.referrals;
CREATE TRIGGER guard_referral_update_trg
BEFORE UPDATE ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.guard_referral_update();

-- Re-add a narrow UPDATE policy (admins via admin policy still work)
CREATE POLICY "Users update own referrals (limited)"
ON public.referrals
FOR UPDATE
TO authenticated
USING (auth.uid() = referrer_id)
WITH CHECK (auth.uid() = referrer_id);

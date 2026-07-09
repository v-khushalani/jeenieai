
-- Referral code generator: 8-char alphanumeric, unique. Uses md5(random) to avoid pgcrypto dependency.
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  raw TEXT;
  ch TEXT;
  i INT;
  attempt INT := 0;
BEGIN
  LOOP
    candidate := 'JN';
    raw := upper(md5(random()::text || clock_timestamp()::text));
    FOR i IN 1..length(raw) LOOP
      ch := substring(raw from i for 1);
      IF position(ch in alphabet) > 0 THEN
        candidate := candidate || ch;
        EXIT WHEN length(candidate) >= 8;
      END IF;
    END LOOP;
    -- pad if too short
    WHILE length(candidate) < 8 LOOP
      candidate := candidate || substring(alphabet from (floor(random() * length(alphabet))::int + 1) for 1);
    END LOOP;
    candidate := substring(candidate from 1 for 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = candidate);
    attempt := attempt + 1;
    EXIT WHEN attempt > 12;
  END LOOP;
  RETURN candidate;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO authenticated, service_role;

-- Auto-assign referral_code on profile insert if missing
CREATE OR REPLACE FUNCTION public.assign_referral_code_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR length(trim(NEW.referral_code)) = 0 THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_referral_code ON public.profiles;
CREATE TRIGGER trg_assign_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_referral_code_on_insert();

-- Backfill existing profiles
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL OR length(trim(referral_code)) = 0;

-- Redeem function
CREATE OR REPLACE FUNCTION public.redeem_referral(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_uid UUID;
  me UUID := auth.uid();
  my_created TIMESTAMPTZ;
  existing_row RECORD;
BEGIN
  IF me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF _code IS NULL OR length(trim(_code)) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT id INTO referrer_uid
    FROM public.profiles WHERE referral_code = upper(trim(_code)) LIMIT 1;

  IF referrer_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_not_found');
  END IF;

  IF referrer_uid = me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_refer_self');
  END IF;

  SELECT created_at INTO my_created FROM public.profiles WHERE id = me;
  IF my_created IS NOT NULL AND my_created < now() - interval '30 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'redemption_window_expired');
  END IF;

  SELECT * INTO existing_row FROM public.referrals
    WHERE referred_user_id = me OR referred_id = me LIMIT 1;
  IF existing_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_user_id, referred_id, referral_code, status, reward_granted)
  VALUES (referrer_uid, me, me, upper(trim(_code)), 'pending', false);

  RETURN jsonb_build_object('ok', true, 'referrer_id', referrer_uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_referral(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_referral(TEXT) TO authenticated;

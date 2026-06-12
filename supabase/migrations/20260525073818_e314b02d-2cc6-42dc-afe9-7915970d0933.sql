
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS level text DEFAULT 'BEGINNER',
  ADD COLUMN IF NOT EXISTS level_progress integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_uidx ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;

ALTER TABLE public.topic_mastery
  ADD COLUMN IF NOT EXISTS accuracy numeric DEFAULT 0;

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referred_id uuid;

ALTER TABLE public.conversion_prompts
  ADD COLUMN IF NOT EXISTS converted boolean DEFAULT false;

ALTER TABLE public.group_tests
  ALTER COLUMN code DROP NOT NULL,
  ALTER COLUMN host_id DROP NOT NULL;


ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_study_time int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_questions_solved int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overall_accuracy numeric DEFAULT 0;

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true;

ALTER TABLE public.extracted_questions_queue
  ADD COLUMN IF NOT EXISTS parsed_question jsonb,
  ADD COLUMN IF NOT EXISTS page_number int;

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.admin_notifications
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS notification_id uuid;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS display_duration text,
  ADD COLUMN IF NOT EXISTS is_popular boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_best_value boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tier text DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text;

-- Set tier sensibly for seeded plans
UPDATE public.subscription_plans SET tier = 'pro_plus' WHERE id LIKE 'pro_plus%';
UPDATE public.subscription_plans SET tier = 'pro' WHERE tier IS NULL OR (id NOT LIKE 'pro_plus%' AND tier <> 'pro');

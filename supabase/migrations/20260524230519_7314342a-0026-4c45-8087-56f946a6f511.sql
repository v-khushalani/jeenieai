
-- ============================================================
-- FULL SCHEMA REBUILD FROM SCRATCH
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','super_admin','student','educator'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.exam_code AS ENUM ('JEE_MAINS','JEE_ADVANCED','NEET'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.difficulty_level AS ENUM ('EASY','MEDIUM','HARD'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.subject_code AS ENUM ('PHYSICS','CHEMISTRY','MATHEMATICS','BIOLOGY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bloom_level_enum AS ENUM ('REMEMBER','UNDERSTAND','APPLY','ANALYZE','EVALUATE','CREATE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.question_style_enum AS ENUM ('numerical','conceptual','formula_based','application','theory'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.question_type_enum AS ENUM ('single_correct','multi_correct','numerical_int','numerical_decimal','assertion_reason','matrix_match','comprehension'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.staging_status AS ENUM ('pending','validated','needs_review','approved','rejected','promoted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- REFERENCE TABLES
-- ============================================================
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  description text,
  exam_type text NOT NULL,
  grade int NOT NULL,
  price numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  is_free boolean DEFAULT false,
  display_order int DEFAULT 0,
  validity_days int DEFAULT 365,
  color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER batches_updated BEFORE UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.batch_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  subject text NOT NULL,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(batch_id, subject)
);

CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  chapter_name text,
  slug text,
  subject text,
  subject_id uuid REFERENCES public.subjects(id),
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  chapter_number int,
  class_level int DEFAULT 11,
  exam_relevance public.exam_code[] DEFAULT ARRAY['JEE_MAINS']::public.exam_code[],
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_chapters_batch ON public.chapters(batch_id);
CREATE INDEX idx_chapters_subject ON public.chapters(subject_id);
CREATE TRIGGER chapters_updated BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  name text,
  topic_name text,
  slug text,
  topic_number int,
  display_order int DEFAULT 0,
  description text,
  difficulty_level text,
  estimated_time int DEFAULT 30,
  estimated_hours numeric,
  is_active boolean DEFAULT true,
  is_free boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_topics_chapter ON public.topics(chapter_id);
CREATE TRIGGER topics_updated BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- USER TABLES
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  city text,
  state text,
  grade int,
  target_exam text,
  goal_exam text,
  target_rank int,
  target_exam_date date,
  subjects text[],
  daily_goal int DEFAULT 15,
  daily_question_limit int DEFAULT 100,
  questions_today int DEFAULT 0,
  smart_goal_enabled boolean DEFAULT false,
  goal_locked boolean DEFAULT false,
  is_premium boolean DEFAULT false,
  subscription_plan text,
  subscription_status text,
  subscription_end_date timestamptz,
  total_points int DEFAULT 0,
  current_streak int DEFAULT 0,
  longest_streak int DEFAULT 0,
  last_activity_date date,
  last_activity timestamptz,
  last_streak_date date,
  streak_freeze_available boolean DEFAULT false,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Profile auto-create on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- QUESTIONS
-- ============================================================
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text,
  question_text text,
  question_image_url text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  options jsonb,
  correct_option text,
  correct_options text[],
  correct_answer text,
  numerical_answer numeric,
  numerical_tolerance numeric,
  question_type text DEFAULT 'single_correct',
  difficulty text DEFAULT 'Medium',
  difficulty_jee_mains public.difficulty_level,
  difficulty_neet public.difficulty_level,
  explanation text,
  subject text,
  subject_id uuid REFERENCES public.subjects(id),
  chapter text,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  concept_id uuid REFERENCES public.concepts(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  exam text,
  exam_relevance public.exam_code[],
  year int,
  pyq_year int,
  is_pyq boolean DEFAULT false,
  source text,
  source_row_id text,
  is_active boolean DEFAULT true,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_questions_chapter ON public.questions(chapter_id);
CREATE INDEX idx_questions_topic ON public.questions(topic_id);
CREATE INDEX idx_questions_batch ON public.questions(batch_id);
CREATE INDEX idx_questions_subject ON public.questions(subject);
CREATE INDEX idx_questions_active ON public.questions(is_active);
CREATE TRIGGER questions_updated BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE VIEW public.questions_public AS
SELECT id, question, question_text, question_image_url, option_a, option_b, option_c, option_d,
  options, question_type, difficulty, subject, subject_id, chapter, chapter_id, topic_id, batch_id,
  exam, exam_relevance, year, pyq_year, source, is_active, created_at
FROM public.questions WHERE is_active = true;

CREATE TABLE public.question_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option text,
  selected_options text[],
  is_correct boolean DEFAULT false,
  time_spent int DEFAULT 0,
  points_earned int DEFAULT 0,
  mode text DEFAULT 'practice',
  test_session_id uuid,
  attempted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_qa_user ON public.question_attempts(user_id);
CREATE INDEX idx_qa_question ON public.question_attempts(question_id);
CREATE INDEX idx_qa_created ON public.question_attempts(created_at DESC);

CREATE TABLE public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text,
  status text DEFAULT 'pending',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.question_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  previous_question text,
  previous_options jsonb,
  previous_answer text,
  previous_explanation text,
  edited_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.topic_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  mastery_level numeric DEFAULT 0,
  questions_attempted int DEFAULT 0,
  questions_correct int DEFAULT 0,
  last_attempted timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, topic_id)
);

CREATE TABLE public.test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  test_type text DEFAULT 'practice',
  title text,
  total_questions int DEFAULT 0,
  attempted_questions int DEFAULT 0,
  correct_answers int DEFAULT 0,
  score numeric DEFAULT 0,
  accuracy numeric DEFAULT 0,
  time_taken int DEFAULT 0,
  time_limit int,
  question_ids jsonb,
  answers jsonb,
  status text DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_ts_user ON public.test_sessions(user_id);

CREATE TABLE public.daily_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  questions_completed int DEFAULT 0,
  questions_attempted int DEFAULT 0,
  questions_correct int DEFAULT 0,
  points_earned int DEFAULT 0,
  daily_target int DEFAULT 15,
  target_met boolean DEFAULT false,
  accuracy_7day numeric DEFAULT 0,
  total_study_time int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE public.points_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  points int NOT NULL,
  description text,
  reference_id text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_points_log_user ON public.points_log(user_id, created_at DESC);

-- ============================================================
-- GAMIFICATION
-- ============================================================
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  tier text DEFAULT 'bronze',
  criteria jsonb,
  points_reward int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- ============================================================
-- REFERRALS / PROMO
-- ============================================================
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_user_id uuid,
  referred_email text,
  referral_code text NOT NULL,
  status text DEFAULT 'pending',
  reward_granted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_id);

CREATE OR REPLACE VIEW public.referrals_safe AS
SELECT id, referrer_id, referred_user_id, referral_code, status, reward_granted, created_at, completed_at
FROM public.referrals;

CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric NOT NULL DEFAULT 0,
  min_amount numeric DEFAULT 0,
  max_redemptions int,
  current_redemptions int DEFAULT 0,
  max_per_user int DEFAULT 1,
  applicable_plan_ids text[] DEFAULT '{}',
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TRIGGER promo_normalize BEFORE INSERT OR UPDATE ON public.promo_codes
FOR EACH ROW EXECUTE FUNCTION public.normalize_promo_code();

CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  plan_id text,
  discount_applied numeric,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- SUBSCRIPTIONS / PAYMENTS
-- ============================================================
CREATE TABLE public.subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric NOT NULL,
  mrp_price numeric,
  currency text DEFAULT 'INR',
  duration_days int NOT NULL,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text,
  amount numeric NOT NULL,
  currency text DEFAULT 'INR',
  status text DEFAULT 'created',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  promo_code_id uuid,
  discount_applied numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_payments_user ON public.payments(user_id);

CREATE TABLE public.payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_table text,
  payment_id text,
  razorpay_order_id text,
  status_from text,
  status_to text,
  changed_by_user uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_batch_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  status text DEFAULT 'active',
  starts_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  payment_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, batch_id)
);

-- ============================================================
-- EDUCATOR / ADMIN CONTENT
-- ============================================================
CREATE TABLE public.educator_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  educator_id uuid NOT NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  content_type text NOT NULL,
  file_url text,
  thumbnail_url text,
  duration int,
  is_premium boolean DEFAULT false,
  approval_status text NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT educator_content_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'))
);
CREATE INDEX idx_ec_status ON public.educator_content(approval_status);

CREATE TABLE public.exam_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_code text NOT NULL UNIQUE,
  exam_name text NOT NULL,
  exam_date date,
  registration_deadline date,
  config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL UNIQUE,
  is_enabled boolean DEFAULT false,
  description text,
  rollout_percentage int DEFAULT 0,
  config jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  target_audience text DEFAULT 'all',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  type text DEFAULT 'info',
  link text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_un_user ON public.user_notifications(user_id, created_at DESC);

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text,
  auth text,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

-- ============================================================
-- IMPORT / EXTRACTION
-- ============================================================
CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text,
  status text DEFAULT 'pending',
  total int DEFAULT 0,
  imported int DEFAULT 0,
  skipped int DEFAULT 0,
  chapters_created int DEFAULT 0,
  topics_created int DEFAULT 0,
  options jsonb DEFAULT '{}'::jsonb,
  skip_reasons jsonb,
  error text,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.extracted_questions_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text,
  raw_data jsonb NOT NULL,
  status public.staging_status DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  promoted_question_id uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- GROUP TESTS / STUDY PLANS / MISC
-- ============================================================
CREATE TABLE public.group_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  title text,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  question_ids jsonb DEFAULT '[]'::jsonb,
  time_limit int,
  status text DEFAULT 'waiting',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_exam text,
  target_rank int,
  exam_date date,
  hours_per_day int,
  plan jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.conversion_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prompt_type text NOT NULL,
  shown_at timestamptz DEFAULT now(),
  action_taken text
);

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PUBLIC READ tables (reference data)
CREATE POLICY "public read subjects" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "public read batches" ON public.batches FOR SELECT USING (true);
CREATE POLICY "public read batch_subjects" ON public.batch_subjects FOR SELECT USING (true);
CREATE POLICY "public read chapters" ON public.chapters FOR SELECT USING (true);
CREATE POLICY "public read topics" ON public.topics FOR SELECT USING (true);
CREATE POLICY "public read concepts" ON public.concepts FOR SELECT USING (true);
CREATE POLICY "public read exam_config" ON public.exam_config FOR SELECT USING (true);
CREATE POLICY "public read feature_flags" ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY "public read subscription_plans" ON public.subscription_plans FOR SELECT USING (is_active = true);
CREATE POLICY "public read badges" ON public.badges FOR SELECT USING (true);

-- Admin write on reference tables
CREATE POLICY "admin manage subjects" ON public.subjects FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage batches" ON public.batches FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage batch_subjects" ON public.batch_subjects FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage chapters" ON public.chapters FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage topics" ON public.topics FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage concepts" ON public.concepts FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage exam_config" ON public.exam_config FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage feature_flags" ON public.feature_flags FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage subscription_plans" ON public.subscription_plans FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage badges" ON public.badges FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Questions: authenticated read, admin manage
CREATE POLICY "auth read questions" ON public.questions FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "admin manage questions" ON public.questions FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Profiles: own + leaderboard public read
CREATE POLICY "users view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles: own read; admin manage
CREATE POLICY "users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'super_admin'));

-- Question attempts: own only
CREATE POLICY "users own attempts" ON public.question_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Topic mastery: SELECT only (writes via RPC)
CREATE POLICY "users view own mastery" ON public.topic_mastery FOR SELECT USING (auth.uid() = user_id);

-- Test sessions: own
CREATE POLICY "users own test_sessions" ON public.test_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Daily progress: own
CREATE POLICY "users own daily_progress" ON public.daily_progress FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Points log: own read; system writes via RPC
CREATE POLICY "users view own points" ON public.points_log FOR SELECT USING (auth.uid() = user_id);

-- User badges: own
CREATE POLICY "users view own badges" ON public.user_badges FOR SELECT USING (auth.uid() = user_id);

-- Referrals: own (no email exposed via view)
CREATE POLICY "users view own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);
CREATE POLICY "users create referrals" ON public.referrals FOR INSERT WITH CHECK (auth.uid() = referrer_id);
REVOKE SELECT (referred_email) ON public.referrals FROM anon, authenticated;

-- Promo: no direct read; admin only
CREATE POLICY "admin manage promo_codes" ON public.promo_codes FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "users view own promo_redemptions" ON public.promo_redemptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin manage promo_redemptions" ON public.promo_redemptions FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Payments: own + admin
CREATE POLICY "users view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin manage payments" ON public.payments FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin view payment_audit" ON public.payment_audit FOR SELECT USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Batch subscriptions
CREATE POLICY "users view own batch_subs" ON public.user_batch_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admin manage batch_subs" ON public.user_batch_subscriptions FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Educator content
CREATE POLICY "public read approved educator content" ON public.educator_content FOR SELECT USING (approval_status = 'approved' OR auth.uid() = educator_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "educator create content" ON public.educator_content FOR INSERT WITH CHECK (auth.uid() = educator_id AND (public.has_role(auth.uid(),'educator') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "educator update own content" ON public.educator_content FOR UPDATE USING (auth.uid() = educator_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete educator content" ON public.educator_content FOR DELETE USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Notifications
CREATE POLICY "users view own notifications" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users update own notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "admin manage user_notifications" ON public.user_notifications FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage admin_notifications" ON public.admin_notifications FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Push subs: own
CREATE POLICY "users manage own push_subs" ON public.push_subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Import jobs / extraction queue: admin only
CREATE POLICY "admin manage import_jobs" ON public.import_jobs FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "admin manage extraction_queue" ON public.extracted_questions_queue FOR ALL USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Question reports
CREATE POLICY "users create reports" ON public.question_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users view own reports" ON public.question_reports FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage reports" ON public.question_reports FOR UPDATE USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Edit history: admin
CREATE POLICY "admin view edit history" ON public.question_edit_history FOR SELECT USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Group tests
CREATE POLICY "auth read group_tests" ON public.group_tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "users create group_tests" ON public.group_tests FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "hosts update group_tests" ON public.group_tests FOR UPDATE USING (auth.uid() = host_id);

-- Study plans
CREATE POLICY "users own study_plans" ON public.study_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Conversion prompts
CREATE POLICY "users own conversion_prompts" ON public.conversion_prompts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- CORE FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.normalize_promo_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN NEW.code = upper(trim(NEW.code)); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.validate_question_answer(p_question_id uuid, p_selected_option text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE q public.questions%ROWTYPE; v_is_correct boolean := false; v_correct text;
BEGIN
  SELECT * INTO q FROM public.questions WHERE id = p_question_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','question_not_found'); END IF;
  IF q.correct_options IS NOT NULL AND array_length(q.correct_options,1) >= 1 THEN v_correct := q.correct_options[1];
  ELSE v_correct := q.correct_option; END IF;
  v_is_correct := p_selected_option IS NOT NULL AND v_correct IS NOT NULL AND upper(p_selected_option) = upper(v_correct);
  RETURN jsonb_build_object('is_correct', v_is_correct, 'correct_option', v_correct, 'explanation', COALESCE(q.explanation,''));
END $$;
GRANT EXECUTE ON FUNCTION public.validate_question_answer(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_topic_mastery(p_user_id uuid, p_topic_id uuid, p_is_correct boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_row public.topic_mastery%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO public.topic_mastery (user_id, topic_id, questions_attempted, questions_correct, last_attempted)
  VALUES (p_user_id, p_topic_id, 1, CASE WHEN p_is_correct THEN 1 ELSE 0 END, now())
  ON CONFLICT (user_id, topic_id) DO UPDATE SET
    questions_attempted = public.topic_mastery.questions_attempted + 1,
    questions_correct = public.topic_mastery.questions_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    last_attempted = now(),
    mastery_level = LEAST(100, ROUND(((public.topic_mastery.questions_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END)::numeric / GREATEST(public.topic_mastery.questions_attempted + 1, 1)) * 100, 2)),
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('success', true, 'mastery_level', v_row.mastery_level);
END $$;

CREATE OR REPLACE FUNCTION public.log_points(p_user_id uuid, p_points int, p_action_type text, p_description text DEFAULT NULL, p_reference_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.points_log (user_id, points, action_type, description, reference_id)
  VALUES (p_user_id, p_points, p_action_type, p_description, p_reference_id) RETURNING id INTO v_id;
  UPDATE public.profiles SET total_points = COALESCE(total_points,0) + p_points, updated_at = now() WHERE id = p_user_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_with_stats(limit_count int DEFAULT 100)
RETURNS TABLE(id uuid, full_name text, avatar_url text, total_points int, current_streak int, total_questions bigint, accuracy numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.avatar_url,
    COALESCE(p.total_points,0), COALESCE(p.current_streak,0),
    COALESCE(qa.total_questions,0)::bigint,
    COALESCE(qa.accuracy,0)
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::bigint AS total_questions,
      CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE is_correct)::numeric / COUNT(*)::numeric)*100, 1) ELSE 0 END AS accuracy
    FROM public.question_attempts qa2 WHERE qa2.user_id = p.id
  ) qa ON true
  WHERE COALESCE(p.total_points,0) > 0 OR COALESCE(qa.total_questions,0) > 0
  ORDER BY COALESCE(p.total_points,0) DESC
  LIMIT limit_count;
END $$;

CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text, p_plan_id text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_code public.promo_codes%ROWTYPE; v_plan public.subscription_plans%ROWTYPE;
  v_user_uses int; v_discount numeric; v_final numeric;
BEGIN
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'reason','Plan not found'); END IF;
  SELECT * INTO v_code FROM public.promo_codes WHERE code = upper(trim(p_code));
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', false, 'reason','Invalid promo code'); END IF;
  IF NOT v_code.is_active THEN RETURN jsonb_build_object('valid', false, 'reason','This code is no longer active'); END IF;
  IF v_code.starts_at IS NOT NULL AND v_code.starts_at > now() THEN RETURN jsonb_build_object('valid', false, 'reason','Not active yet'); END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN RETURN jsonb_build_object('valid', false, 'reason','Expired'); END IF;
  IF v_code.max_redemptions IS NOT NULL AND v_code.current_redemptions >= v_code.max_redemptions THEN RETURN jsonb_build_object('valid', false, 'reason','Fully redeemed'); END IF;
  IF array_length(v_code.applicable_plan_ids,1) > 0 AND NOT (p_plan_id = ANY(v_code.applicable_plan_ids)) THEN RETURN jsonb_build_object('valid', false, 'reason','Not valid for selected plan'); END IF;
  IF v_code.min_amount > 0 AND v_plan.price < v_code.min_amount THEN RETURN jsonb_build_object('valid', false, 'reason','Plan price below minimum'); END IF;
  SELECT COUNT(*) INTO v_user_uses FROM public.promo_redemptions WHERE promo_code_id = v_code.id AND user_id = p_user_id;
  IF v_user_uses >= v_code.max_per_user THEN RETURN jsonb_build_object('valid', false, 'reason','Already used'); END IF;
  IF v_code.discount_type = 'percent' THEN v_discount := ROUND(v_plan.price * v_code.discount_value / 100);
  ELSE v_discount := LEAST(v_code.discount_value, v_plan.price); END IF;
  v_final := GREATEST(v_plan.price - v_discount, 1);
  RETURN jsonb_build_object('valid', true, 'promo_code_id', v_code.id, 'code', v_code.code,
    'discount_type', v_code.discount_type, 'discount_value', v_code.discount_value,
    'discount_applied', v_discount, 'original_price', v_plan.price, 'final_price', v_final);
END $$;

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_full_name text DEFAULT NULL, p_avatar_url text DEFAULT NULL, p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL, p_state text DEFAULT NULL, p_daily_goal int DEFAULT NULL,
  p_smart_goal_enabled boolean DEFAULT NULL, p_target_exam text DEFAULT NULL, p_grade int DEFAULT NULL,
  p_target_exam_date date DEFAULT NULL, p_subjects text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  UPDATE public.profiles SET
    full_name = COALESCE(p_full_name, full_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    city = COALESCE(p_city, city),
    state = COALESCE(p_state, state),
    daily_goal = COALESCE(p_daily_goal, daily_goal),
    smart_goal_enabled = COALESCE(p_smart_goal_enabled, smart_goal_enabled),
    target_exam = COALESCE(p_target_exam, target_exam),
    grade = COALESCE(p_grade, grade),
    target_exam_date = COALESCE(p_target_exam_date, target_exam_date),
    subjects = COALESCE(p_subjects, subjects),
    updated_at = now()
  WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.ensure_daily_progress(p_user_id uuid, p_daily_target int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_target int; v_pg int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT COALESCE(daily_goal,15) INTO v_pg FROM public.profiles WHERE id = p_user_id;
  v_target := GREATEST(COALESCE(p_daily_target,15), COALESCE(v_pg,15));
  INSERT INTO public.daily_progress (user_id, date, daily_target, questions_completed, target_met)
  VALUES (p_user_id, v_today, v_target, 0, false) ON CONFLICT (user_id, date) DO NOTHING;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.sync_daily_progress(p_user_id uuid, p_is_correct boolean, p_points_delta int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_goal int; v_points int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_points := GREATEST(0, LEAST(COALESCE(p_points_delta,0), 100));
  SELECT COALESCE(daily_goal,15) INTO v_goal FROM public.profiles WHERE id = p_user_id;
  INSERT INTO public.daily_progress (user_id, date, questions_completed, questions_attempted, questions_correct, points_earned, daily_target, target_met)
  VALUES (p_user_id, v_today, 1, 1, CASE WHEN p_is_correct THEN 1 ELSE 0 END, v_points, v_goal, 1 >= v_goal)
  ON CONFLICT (user_id, date) DO UPDATE SET
    questions_completed = public.daily_progress.questions_completed + 1,
    questions_attempted = public.daily_progress.questions_attempted + 1,
    questions_correct = public.daily_progress.questions_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    points_earned = public.daily_progress.points_earned + v_points,
    daily_target = v_goal,
    target_met = (public.daily_progress.questions_completed + 1) >= v_goal,
    updated_at = now();
  RETURN jsonb_build_object('success', true, 'date', v_today);
END $$;

CREATE OR REPLACE FUNCTION public.update_daily_accuracy(p_user_id uuid, p_accuracy numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date; v_acc numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_acc := GREATEST(0, LEAST(COALESCE(p_accuracy,0), 100));
  INSERT INTO public.daily_progress (user_id, date, accuracy_7day) VALUES (p_user_id, v_today, v_acc)
  ON CONFLICT (user_id, date) DO UPDATE SET accuracy_7day = EXCLUDED.accuracy_7day, updated_at = now();
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  UPDATE public.profiles SET is_premium = false, updated_at = now()
  WHERE is_premium = true AND subscription_end_date IS NOT NULL AND subscription_end_date < now();
END $$;

-- ============================================================
-- SEED reference data
-- ============================================================
INSERT INTO public.subjects (name, code, display_order) VALUES
  ('Physics','PHYSICS',1),('Chemistry','CHEMISTRY',2),
  ('Mathematics','MATHEMATICS',3),('Biology','BIOLOGY',4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.batches (name, slug, exam_type, grade, description, is_active, display_order) VALUES
  ('JEE 11','jee-11','JEE',11,'Class 11 JEE preparation',true,1),
  ('JEE 12','jee-12','JEE',12,'Class 12 JEE preparation',true,2),
  ('NEET 11','neet-11','NEET',11,'Class 11 NEET preparation',true,3),
  ('NEET 12','neet-12','NEET',12,'Class 12 NEET preparation',true,4)
ON CONFLICT DO NOTHING;

INSERT INTO public.subscription_plans (id, name, price, mrp_price, duration_days, features, display_order) VALUES
  ('monthly','Pro Monthly',499,999,30,'["AI Doubt Solver — Limited access","Full question bank","Daily practice"]'::jsonb,1),
  ('yearly','Pro Yearly',899,2999,365,'["Everything in Monthly","Priority support"]'::jsonb,2),
  ('pro_plus_monthly','Pro+ Monthly',349,1999,30,'["Adaptive AI Study Planner","AI Rank Predictor","Educator PPTs & simulations","WhatsApp priority support"]'::jsonb,3),
  ('pro_plus_yearly','Pro+ Yearly',1799,5999,365,'["Everything in Pro+ Monthly","Best value"]'::jsonb,4)
ON CONFLICT (id) DO NOTHING;

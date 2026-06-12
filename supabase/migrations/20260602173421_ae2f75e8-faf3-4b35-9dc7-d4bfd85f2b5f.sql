-- Composite indexes for hot queries (user dashboards, stats, history)
CREATE INDEX IF NOT EXISTS idx_qa_user_attempted ON public.question_attempts (user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_user_correct ON public.question_attempts (user_id, is_correct);
CREATE INDEX IF NOT EXISTS idx_daily_progress_user_date ON public.daily_progress (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ts_user_completed ON public.test_sessions (user_id, completed_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_points_log_user_created ON public.points_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_user ON public.topic_mastery (user_id, mastery_level DESC);
CREATE INDEX IF NOT EXISTS idx_questions_active_chapter ON public.questions (chapter_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_questions_active_topic ON public.questions (topic_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chapters_batch_active ON public.chapters (batch_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_topics_chapter_active ON public.topics (chapter_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;
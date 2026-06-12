ALTER TABLE public.chapters
  ADD CONSTRAINT chapters_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE SET NULL;

ALTER TABLE public.questions
  ADD CONSTRAINT questions_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_subject_active ON public.questions(subject_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_questions_chapter_active ON public.questions(chapter_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_questions_topic_active ON public.questions(topic_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_questions_batch ON public.questions(batch_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_chapters_subject ON public.chapters(subject_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_topics_chapter ON public.topics(chapter_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_question_attempts_user_question ON public.question_attempts(user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_user_attempted ON public.question_attempts(user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_mastery_user ON public.topic_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_user_status ON public.test_sessions(user_id, status);
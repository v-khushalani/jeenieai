
CREATE INDEX IF NOT EXISTS idx_questions_chapter_exam_active
  ON public.questions (chapter_id, exam)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_questions_topic_exam_active
  ON public.questions (topic_id, exam)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_questions_subject_exam_active
  ON public.questions (subject, exam)
  WHERE is_active = true;

ANALYZE public.questions;

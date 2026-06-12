
-- Backfill: ensure every chapter has a "General" topic
INSERT INTO public.topics (chapter_id, name, topic_name, slug, topic_number, display_order, is_active)
SELECT c.id, 'General', 'General', 'general-' || substr(c.id::text, 1, 8), 1, 1, true
FROM public.chapters c
WHERE NOT EXISTS (SELECT 1 FROM public.topics t WHERE t.chapter_id = c.id);

-- Backfill topic_id for any existing questions missing it (idempotent)
UPDATE public.questions q
SET topic_id = (
  SELECT t.id FROM public.topics t
  WHERE t.chapter_id = q.chapter_id
  ORDER BY t.topic_number NULLS LAST, t.display_order, t.created_at
  LIMIT 1
)
WHERE q.topic_id IS NULL AND q.chapter_id IS NOT NULL;

-- Performance indexes for hot read paths
CREATE INDEX IF NOT EXISTS idx_questions_chapter_active
  ON public.questions (chapter_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_questions_topic_active
  ON public.questions (topic_id) WHERE is_active = true AND topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_questions_subject_active
  ON public.questions (subject_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_chapters_subject_name
  ON public.chapters (subject_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_topics_chapter
  ON public.topics (chapter_id);

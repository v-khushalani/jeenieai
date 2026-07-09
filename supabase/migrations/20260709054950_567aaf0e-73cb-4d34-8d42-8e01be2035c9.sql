
-- Spaced-repetition revision schedule (SM-2 lite)
CREATE TABLE IF NOT EXISTS public.revision_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT,
  chapter_id UUID,
  topic_id UUID,
  next_due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  interval_days NUMERIC NOT NULL DEFAULT 1,
  ease_factor NUMERIC NOT NULL DEFAULT 2.5,
  last_reviewed_at TIMESTAMPTZ,
  reviews_count INT NOT NULL DEFAULT 0,
  correct_streak INT NOT NULL DEFAULT 0,
  last_accuracy NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS revision_schedule_uniq
  ON public.revision_schedule (user_id, COALESCE(topic_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(chapter_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS revision_schedule_due_idx ON public.revision_schedule (user_id, next_due_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revision_schedule TO authenticated;
GRANT ALL ON public.revision_schedule TO service_role;

ALTER TABLE public.revision_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own revision schedule" ON public.revision_schedule;
CREATE POLICY "Users manage own revision schedule" ON public.revision_schedule
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SM-2 lite update triggered after each question attempt
CREATE OR REPLACE FUNCTION public.update_revision_from_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q_chapter UUID;
  q_topic UUID;
  q_subject TEXT;
  new_interval NUMERIC;
  new_ease NUMERIC;
  new_streak INT;
  existing public.revision_schedule%ROWTYPE;
BEGIN
  SELECT chapter_id, topic_id, subject INTO q_chapter, q_topic, q_subject
  FROM public.questions WHERE id = NEW.question_id;

  IF q_chapter IS NULL AND q_topic IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO existing FROM public.revision_schedule
   WHERE user_id = NEW.user_id
     AND COALESCE(topic_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(q_topic, '00000000-0000-0000-0000-000000000000'::uuid)
     AND COALESCE(chapter_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(q_chapter, '00000000-0000-0000-0000-000000000000'::uuid)
   LIMIT 1;

  IF NEW.is_correct THEN
    new_streak := COALESCE(existing.correct_streak, 0) + 1;
    new_ease := LEAST(2.8, COALESCE(existing.ease_factor, 2.5) + 0.05);
    new_interval := CASE
      WHEN new_streak = 1 THEN 1
      WHEN new_streak = 2 THEN 3
      WHEN new_streak = 3 THEN 7
      ELSE LEAST(60, COALESCE(existing.interval_days, 1) * new_ease)
    END;
  ELSE
    new_streak := 0;
    new_ease := GREATEST(1.5, COALESCE(existing.ease_factor, 2.5) - 0.2);
    new_interval := 1;
  END IF;

  INSERT INTO public.revision_schedule (
    user_id, subject, chapter_id, topic_id,
    next_due_at, interval_days, ease_factor,
    last_reviewed_at, reviews_count, correct_streak, last_accuracy, updated_at
  ) VALUES (
    NEW.user_id, q_subject, q_chapter, q_topic,
    now() + (new_interval || ' days')::interval, new_interval, new_ease,
    now(), 1, new_streak, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, now()
  )
  ON CONFLICT (user_id, COALESCE(topic_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(chapter_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    next_due_at = now() + (new_interval || ' days')::interval,
    interval_days = new_interval,
    ease_factor = new_ease,
    last_reviewed_at = now(),
    reviews_count = revision_schedule.reviews_count + 1,
    correct_streak = new_streak,
    last_accuracy = 0.7 * COALESCE(revision_schedule.last_accuracy, 0.5) + 0.3 * (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END),
    subject = COALESCE(q_subject, revision_schedule.subject),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_revision_from_attempt ON public.question_attempts;
CREATE TRIGGER trg_update_revision_from_attempt
AFTER INSERT ON public.question_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_revision_from_attempt();

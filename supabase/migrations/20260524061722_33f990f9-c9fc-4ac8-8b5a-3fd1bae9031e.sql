DROP VIEW IF EXISTS public.questions_public CASCADE;

CREATE VIEW public.questions_public
WITH (security_invoker = true) AS
SELECT
  q.id,
  q.subject_id,
  q.chapter_id,
  q.topic_id,
  q.concept_id,
  q.exam_relevance,
  q.question_style,
  q.question_type,
  q.difficulty_jee_mains,
  q.difficulty_jee_advanced,
  q.difficulty_neet,
  q.question_text,
  q.question_image_url,
  q.options,
  q.correct_options,
  q.numerical_answer,
  q.numerical_tolerance,
  q.is_pyq,
  q.pyq_year,
  q.pyq_session,
  q.pyq_exam,
  q.marking_correct,
  q.marking_incorrect,
  q.marking_unattempted,
  q.bloom_level,
  q.expected_time_sec,
  q.is_active,
  q.is_verified,
  q.created_at,
  q.updated_at,
  q.question,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.correct_option,
  q.subject,
  q.chapter,
  q.topic,
  q.batch_id,
  q.difficulty,
  q.exam,
  q.year,
  q.explanation
FROM public.questions q
WHERE q.is_active = true;

GRANT SELECT ON public.questions_public TO anon, authenticated;
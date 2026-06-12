REVOKE EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[], text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_chapter_question_counts(text, uuid[], text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_topic_question_counts(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_subject_question_counts(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chapter_question_counts(text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_topic_question_counts(uuid) TO authenticated;
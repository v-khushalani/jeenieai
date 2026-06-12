
DROP TABLE IF EXISTS public.question_edit_history CASCADE;
DROP TABLE IF EXISTS public.question_features CASCADE;
DROP TABLE IF EXISTS public.question_mapping_audit CASCADE;
DROP TABLE IF EXISTS public.question_metrics CASCADE;
DROP TABLE IF EXISTS public.question_solutions CASCADE;
DROP TABLE IF EXISTS public.question_tags CASCADE;
DROP TABLE IF EXISTS public.question_telemetry CASCADE;

DROP TABLE IF EXISTS public.free_content_limits CASCADE;
DROP TABLE IF EXISTS public.ml_difficulty_models CASCADE;
DROP TABLE IF EXISTS public.ml_training_runs CASCADE;
DROP TABLE IF EXISTS public.payment_audit CASCADE;
DROP TABLE IF EXISTS public.staging_questions CASCADE;

 -- Regular views
 DROP VIEW IF EXISTS public.chapter_question_counts CASCADE;
 DROP VIEW IF EXISTS public.group_test_leaderboard CASCADE;
 
 -- Materialized views
 DROP MATERIALIZED VIEW IF EXISTS public.mv_chapter_question_counts CASCADE;
 
 -- Tables
 DROP TABLE IF EXISTS public.exams CASCADE;
 DROP TABLE IF EXISTS public.concepts CASCADE;

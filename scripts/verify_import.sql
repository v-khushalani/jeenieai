-- Verify import job and sample questions created by demo import
-- Run these in the Supabase SQL editor

-- 1) Find the demo import job
SELECT * FROM import_jobs
WHERE (options->>'sourceTag') = 'datavorous/entrance-exam-dataset-demo'
ORDER BY started_at DESC LIMIT 1;

-- 2) Recently created chapters (last 2 hours)
SELECT id, name, slug, subject_id, batch_id, created_at
FROM chapters
WHERE created_at > now() - interval '2 hours'
ORDER BY created_at DESC LIMIT 200;

-- 3) Sample questions from demo import and their chapter mapping
SELECT q.id, q.question, q.chapter, q.chapter_id, c.name AS chapter_name
FROM questions q
LEFT JOIN chapters c ON q.chapter_id = c.id
WHERE q.source = 'datavorous/entrance-exam-dataset-demo'
LIMIT 100;

-- 4) Counts by chapter for demo source
SELECT q.chapter, count(*) FROM questions q
WHERE q.source = 'datavorous/entrance-exam-dataset-demo'
GROUP BY q.chapter ORDER BY count DESC LIMIT 50;

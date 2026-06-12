#!/usr/bin/env node
/*
Run full reconcile + demo workflow against your Postgres DB.
Usage:
  1. Install deps: npm install pg
  2. Set env: export PG_CONN_STRING="postgresql://user:password@host:5432/dbname"
     (on Windows PowerShell: $env:PG_CONN_STRING = "..."")
  3. Run: node scripts/run_full_reconcile_and_demo.js

This script will:
 - Run the reconcile migration SQL in supabase/migrations/20260529142000_reconcile_questions_with_chapters.sql
 - Create demo batches, chapter, and questions (idempotent)
 - Show counts before and after moving the chapter from grade 12 -> 11
 - Perform the move and run reconciliation again
 - Print verification queries so you can confirm in UI

IMPORTANT: Run on staging or with backups first.
*/

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const conn = process.env.PG_CONN_STRING;
  if (!conn) {
    console.error('Missing PG_CONN_STRING environment variable.');
    process.exit(1);
  }

  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    const sqlPath = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260529142000_reconcile_questions_with_chapters.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running reconcile migration...');
    const res = await client.query(sql);
    console.log('Reconcile migration executed. Result:', res && res.rows ? res.rows : '(no rows)');

    console.log('\nCreating demo batches/chapters/questions (idempotent)...');
    const demoSql = `
-- demo batches
INSERT INTO public.batches (id, exam_type, grade, name, is_active)
VALUES ('11111111-1111-1111-1111-111111111111','JEE',12,'DEMO-JEE-12', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.batches (id, exam_type, grade, name, is_active)
VALUES ('22222222-2222-2222-2222-222222222222','JEE',11,'DEMO-JEE-11', true)
ON CONFLICT (id) DO NOTHING;

-- demo chapter
INSERT INTO public.chapters (id, chapter_name, name, subject, batch_id, chapter_number, class_level, is_active)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Work, Power and Energy','Work, Power and Energy','PHYSICS','11111111-1111-1111-1111-111111111111',1,12,true)
ON CONFLICT (id) DO NOTHING;

-- demo questions
INSERT INTO public.questions (id, chapter_id, chapter, subject, batch_id, exam, is_active)
VALUES
  ('q0000001-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Work, Power and Energy','PHYSICS','11111111-1111-1111-1111-111111111111','JEE Mains', true),
  ('q0000002-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Work, Power and Energy','PHYSICS','11111111-1111-1111-1111-111111111111','JEE Mains', true),
  ('q0000003-0000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Work, Power and Energy','PHYSICS','11111111-1111-1111-1111-111111111111','JEE Mains', true),
  ('q0000004-0000-0000-0000-000000000004','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Work, Power and Energy','PHYSICS','11111111-1111-1111-1111-111111111111','JEE Mains', true),
  ('q0000005-0000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Work, Power and Energy','PHYSICS','11111111-1111-1111-1111-111111111111','JEE Mains', true)
ON CONFLICT (id) DO NOTHING;
`;
    await client.query(demoSql);
    console.log('Demo data ensured.');

    console.log('\nCounts BEFORE move:');
    const beforeCounts = await client.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM public.questions WHERE chapter_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';");
    console.log(beforeCounts.rows);

    const beforeGroup = await client.query("SELECT batch_id, COUNT(*) FROM public.questions WHERE chapter_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' GROUP BY batch_id;");
    console.log('By batch:', beforeGroup.rows);

    console.log('\nSimulating chapter move to demo grade 11 batch...');
    await client.query("UPDATE public.chapters SET batch_id = '22222222-2222-2222-2222-222222222222', class_level = 11 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';");

    console.log('Running reconciliation again...');
    const res2 = await client.query(sql);
    console.log('Reconcile result after move:', res2 && res2.rows ? res2.rows : '(no rows)');

    console.log('\nCounts AFTER move:');
    const afterCounts = await client.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM public.questions WHERE chapter_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';");
    console.log(afterCounts.rows);
    const afterGroup = await client.query("SELECT batch_id, COUNT(*) FROM public.questions WHERE chapter_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' GROUP BY batch_id;");
    console.log('By batch:', afterGroup.rows);

    console.log('\nSample RPC outputs (global and batch-scoped) for Physics:');
    const globalRpc = await client.query("SELECT c.id AS chapter_id, COUNT(q.*) AS count FROM public.questions q JOIN public.chapters c ON c.id = q.chapter_id WHERE c.subject ILIKE '%PHYSICS%' GROUP BY c.id ORDER BY c.chapter_name LIMIT 50;");
    console.log('Global per-chapter counts (sample):', globalRpc.rows.slice(0, 20));

    const batchRpc = await client.query("SELECT c.id AS chapter_id, COUNT(q.*) AS count FROM public.questions q JOIN public.chapters c ON c.id = q.chapter_id WHERE c.subject ILIKE '%PHYSICS%' AND c.batch_id = '22222222-2222-2222-2222-222222222222' GROUP BY c.id ORDER BY c.chapter_name LIMIT 50;");
    console.log('Batch-scoped per-chapter counts (sample):', batchRpc.rows.slice(0, 20));

    console.log('\nDone. If counts look right here, refresh the app UI (or clear any caches) and verify Study Now and chapter pages.');

  } catch (err) {
    console.error('Error during run:', err);
  } finally {
    await client.end();
  }
}

main();

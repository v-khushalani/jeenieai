#!/usr/bin/env node
// Diagnostic: compare RPC subject/chapter totals with direct per-chapter sums
// Usage: PG_CONNECTION_STRING="postgres://..." node scripts/check_question_counts.js

import pg from 'pg';

const { Client } = pg;

async function main() {
  const conn = process.env.PG_CONNECTION_STRING || process.argv[2];
  if (!conn) {
    console.error('Provide PG connection string as PG_CONNECTION_STRING or first arg');
    process.exit(2);
  }

  const client = new Client({ connectionString: conn });
  await client.connect();

  try {
    console.log('Fetching RPC subject totals...');
    const subjectRows = await client.query('SELECT * FROM get_subject_question_counts(NULL, NULL)');
    const subjects = subjectRows.rows;

    console.log(`Found ${subjects.length} subjects from RPC.`);

    for (const s of subjects) {
      const subj = s.subject;
      const rpcCount = Number(s.count || 0);
      // get scoped chapter rows (global chapter_ids with counts)
      const chapterRows = await client.query(
        `SELECT q.chapter_id, COUNT(*) AS cnt
         FROM public.questions q
         LEFT JOIN public.chapters c ON c.id = q.chapter_id
         WHERE COALESCE(c.subject, q.subject) ILIKE $1
           AND q.is_active = true
         GROUP BY q.chapter_id`,
        [`%${subj}%`]
      );

      const chapterSum = chapterRows.rows.reduce((sum, r) => sum + Number(r.cnt || 0), 0);

      if (rpcCount !== chapterSum) {
        console.log(`Mismatch for subject='${subj}': RPC=${rpcCount}, chapterSum=${chapterSum}`);
        console.log('  Sample chapter counts:');
        chapterRows.rows.slice(0,10).forEach(r => console.log(`    ${r.chapter_id}: ${r.cnt}`));
      }
    }

    // Also sample a chapter that the user mentioned: try to detect very large
    // per-chapter counts and show RPC vs per-chapter.
    console.log('\nChecking per-chapter RPC vs direct counts for top chapters...');
    const topChapters = await client.query(`
      SELECT c.id AS chapter_id, c.chapter_name, COUNT(q.*) AS direct_count
      FROM public.chapters c
      JOIN public.questions q ON q.chapter_id = c.id
      WHERE q.is_active = true
      GROUP BY c.id
      ORDER BY direct_count DESC
      LIMIT 50
    `);

    for (const ch of topChapters.rows) {
      const chapterId = ch.chapter_id;
      const direct = Number(ch.direct_count || 0);
      // call RPC for this subject to get chapter counts
      const rpcRes = await client.query(`SELECT * FROM get_chapter_question_counts($1, NULL, NULL)`, [ `%${ch.chapter_name}%` ]);
      const rpcForId = (rpcRes.rows || []).find(r => String(r.chapter_id) === String(chapterId));
      const rpcVal = rpcForId ? Number(rpcForId.count || 0) : 0;
      if (direct !== rpcVal) {
        console.log(`Chapter ${ch.chapter_name} (${chapterId}): direct=${direct}, rpc=${rpcVal}`);
      }
    }

    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });

/**
 * JEEnie Mentor Roadmap Engine
 * Deterministic chapter-by-chapter mastery roadmap.
 *
 * Walks the user through the syllabus in order:
 *   Learn → Fix weak → Revise mistakes → Chapter test → Next chapter
 *
 * Reads existing tables only — no heavy new schema.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { getSubjectAliases } from '@/lib/subjectNormalization';

export type Milestone = 'learn' | 'drill' | 'review' | 'test';
export type MilestoneState = 'pending' | 'in_progress' | 'done';

export interface MilestoneInfo {
  key: Milestone;
  label: string;
  state: MilestoneState;
  /** 0..target progress (e.g. 8/15 attempts) */
  current: number;
  target: number;
  /** short Hinglish helper line for the chip */
  hint: string;
}

export interface RoadmapChapter {
  id: string;
  subject: string;
  title: string;
  classLevel: number | null;
  chapterNumber: number | null;
  attempts: number;
  correct: number;
  accuracy: number;
  stars: 0 | 1 | 2 | 3;
  /** 'done' | 'active' | 'locked' */
  status: 'done' | 'active' | 'locked';
  milestones: MilestoneInfo[];
  /** % of milestones completed */
  progressPct: number;
}

export interface SubjectRoadmap {
  subject: string;
  chapters: RoadmapChapter[];
  activeChapterId: string | null;
  doneCount: number;
  totalCount: number;
}

export const SUBJECTS_BY_EXAM: Record<string, string[]> = {
  JEE: ['PHYSICS', 'CHEMISTRY', 'MATHEMATICS'],
  NEET: ['PHYSICS', 'CHEMISTRY', 'BIOLOGY'],
};

const LEARN_TARGET = 15;
const TEST_TARGET = 20;
const MASTERY_OK = 0.7; // 70%

function pickStars(acc: number): 0 | 1 | 2 | 3 {
  if (acc >= 0.92) return 3;
  if (acc >= 0.85) return 2;
  if (acc >= 0.7) return 1;
  return 0;
}

interface ChapterRow {
  id: string;
  subject: string | null;
  chapter_name: string | null;
  name: string | null;
  chapter_number: number | null;
  class_level: number | null;
}

interface AttemptAgg {
  attempts: number;
  correct: number;
  wrongIds: Set<string>;
  correctedIds: Set<string>;
}

interface PersistedMilestone {
  chapter_id: string;
  milestone: Milestone;
  status: MilestoneState;
}

export function normalizeExam(target: string | null | undefined): 'JEE' | 'NEET' {
  const v = (target || 'JEE').toUpperCase();
  if (v.includes('NEET')) return 'NEET';
  return 'JEE';
}

export function subjectsForExam(exam: 'JEE' | 'NEET'): string[] {
  return SUBJECTS_BY_EXAM[exam] || SUBJECTS_BY_EXAM.JEE;
}

export function examRelevanceValues(exam: 'JEE' | 'NEET'): ('JEE_MAINS' | 'JEE_ADVANCED' | 'NEET')[] {
  return exam === 'JEE' ? ['JEE_MAINS', 'JEE_ADVANCED'] : ['NEET'];
}

/**
 * Build the roadmap for one subject, for one user.
 */
export async function buildSubjectRoadmap(
  userId: string,
  exam: 'JEE' | 'NEET',
  subject: string,
): Promise<SubjectRoadmap> {
  // 1. Chapters in this subject for this exam.
  // IMPORTANT: exam_relevance is exam_code[] and accepts ONLY enum labels.
  // Passing text variants like "JEE" makes PostgREST reject the whole query.
  const { data: chapterRows, error: chapErr } = await supabase
    .from('chapters')
    .select('id, subject, chapter_name, name, chapter_number, class_level')
    .eq('is_active', true)
    .in('subject', getSubjectAliases(subject))
    .overlaps('exam_relevance', examRelevanceValues(exam))
    .order('class_level', { ascending: true, nullsFirst: false })
    .order('chapter_number', { ascending: true, nullsFirst: false })
    .limit(60);

  if (chapErr) logger.error('roadmap: chapters load', chapErr);
  const chapters: ChapterRow[] = (chapterRows || []) as ChapterRow[];
  if (chapters.length === 0) {
    return { subject, chapters: [], activeChapterId: null, doneCount: 0, totalCount: 0 };
  }
  const chapterIds = chapters.map((c) => c.id);

  // 2. Attempts joined with question.chapter_id (server-side filter)
  const { data: attemptRows, error: attErr } = await supabase
    .from('question_attempts')
    .select('question_id, is_correct, attempted_at, question:questions!inner(chapter_id)')
    .eq('user_id', userId)
    .in('question.chapter_id', chapterIds);
  if (attErr) logger.error('roadmap: attempts load', attErr);

  const agg = new Map<string, AttemptAgg>();
  for (const c of chapters) agg.set(c.id, { attempts: 0, correct: 0, wrongIds: new Set(), correctedIds: new Set() });

  for (const r of (attemptRows || []) as any[]) {
    const chId = r.question?.chapter_id;
    if (!chId || !agg.has(chId)) continue;
    const a = agg.get(chId)!;
    a.attempts += 1;
    if (r.is_correct) {
      a.correct += 1;
      if (r.question_id) a.correctedIds.add(r.question_id);
    } else if (r.question_id) {
      a.wrongIds.add(r.question_id);
    }
  }

  // 3. Persisted milestone overrides (e.g. chapter test result)
  const { data: progRows } = await supabase
    .from('study_plan_progress')
    .select('chapter_id, milestone, status')
    .eq('user_id', userId)
    .in('chapter_id', chapterIds);

  const persisted = new Map<string, Map<Milestone, MilestoneState>>();
  for (const r of (progRows || []) as PersistedMilestone[]) {
    if (!r.chapter_id || !r.milestone) continue;
    if (!persisted.has(r.chapter_id)) persisted.set(r.chapter_id, new Map());
    persisted.get(r.chapter_id)!.set(r.milestone, r.status);
  }

  // 4. Compute per-chapter state
  const built: RoadmapChapter[] = chapters.map((c) => {
    const a = agg.get(c.id)!;
    const accuracy = a.attempts > 0 ? a.correct / a.attempts : 0;
    const stars = pickStars(accuracy);
    const persistedMs = persisted.get(c.id) || new Map<Milestone, MilestoneState>();

    // LEARN
    const learnDone = a.attempts >= LEARN_TARGET && accuracy >= 0.6;
    const learn: MilestoneInfo = {
      key: 'learn',
      label: 'Learn the basics',
      state: learnDone ? 'done' : a.attempts > 0 ? 'in_progress' : 'pending',
      current: Math.min(a.attempts, LEARN_TARGET),
      target: LEARN_TARGET,
      hint: learnDone
        ? `${a.attempts} Qs solved · ${Math.round(accuracy * 100)}% acc`
        : `Solve ${LEARN_TARGET} questions to unlock next step`,
    };

    // DRILL — only meaningful once learn done; checks accuracy bar
    const drillDone = learnDone && accuracy >= MASTERY_OK;
    const drill: MilestoneInfo = {
      key: 'drill',
      label: 'Fix weak spots',
      state: !learnDone
        ? 'pending'
        : drillDone
          ? 'done'
          : 'in_progress',
      current: Math.round(accuracy * 100),
      target: Math.round(MASTERY_OK * 100),
      hint: !learnDone
        ? 'Pehle Learn complete kar'
        : drillDone
          ? `Accuracy ${Math.round(accuracy * 100)}% — solid`
          : `Accuracy ${Math.round(accuracy * 100)}% — push to 70%+`,
    };

    // REVIEW — unattempted wrong questions
    const wrongPending = [...a.wrongIds].filter((qid) => !a.correctedIds.has(qid)).length;
    const reviewDone = learnDone && wrongPending === 0;
    const review: MilestoneInfo = {
      key: 'review',
      label: 'Revise mistakes',
      state: !learnDone
        ? 'pending'
        : reviewDone
          ? 'done'
          : 'in_progress',
      current: wrongPending,
      target: 0,
      hint: !learnDone
        ? 'Pehle Learn complete kar'
        : reviewDone
          ? 'Sab galtiyaan sudhar li'
          : `${wrongPending} galat questions baaki hai`,
    };

    // TEST — persisted only
    const testState = persistedMs.get('test') || 'pending';
    const test: MilestoneInfo = {
      key: 'test',
      label: 'Chapter test',
      state: testState,
      current: testState === 'done' ? TEST_TARGET : 0,
      target: TEST_TARGET,
      hint:
        testState === 'done'
          ? 'Chapter test cleared ✓'
          : !learnDone
            ? 'Pehle Learn complete kar'
            : `${TEST_TARGET}-Q timed test to seal the deal`,
    };

    const milestones: MilestoneInfo[] = [learn, drill, review, test];
    const doneMs = milestones.filter((m) => m.state === 'done').length;
    const allDone = doneMs === milestones.length;

    return {
      id: c.id,
      subject: c.subject || subject,
      title: c.chapter_name || c.name || 'Untitled chapter',
      classLevel: c.class_level,
      chapterNumber: c.chapter_number,
      attempts: a.attempts,
      correct: a.correct,
      accuracy,
      stars,
      // status filled in next pass once we know the first incomplete chapter
      status: allDone ? 'done' : 'locked',
      milestones,
      progressPct: Math.round((doneMs / milestones.length) * 100),
    };
  });

  // 5. Activate the first non-done chapter; lock the rest
  let activeChapterId: string | null = null;
  for (const ch of built) {
    if (ch.status === 'done') continue;
    if (!activeChapterId) {
      ch.status = 'active';
      activeChapterId = ch.id;
    } else {
      ch.status = 'locked';
    }
  }

  const doneCount = built.filter((c) => c.status === 'done').length;
  return {
    subject,
    chapters: built,
    activeChapterId,
    doneCount,
    totalCount: built.length,
  };
}

/**
 * Mark a milestone as done (used for chapter test).
 */
export async function markMilestone(
  userId: string,
  chapterId: string,
  milestone: Milestone,
  status: MilestoneState = 'done',
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const taskHash = `roadmap::${chapterId}::${milestone}`;
  await supabase
    .from('study_plan_progress')
    .upsert(
      {
        user_id: userId,
        plan_date: today,
        task_hash: taskHash,
        task_label: `${milestone} · ${chapterId.slice(0, 8)}`,
        chapter_id: chapterId,
        milestone,
        status,
        last_synced_at: new Date().toISOString(),
      } as any,
      { onConflict: 'user_id,plan_date,task_hash' },
    );
}

/**
 * Build deep-link URLs for each milestone action.
 */
export function milestoneHref(chapter: RoadmapChapter, milestone: Milestone): string {
  const base = `chapter_id=${chapter.id}&subject=${encodeURIComponent(chapter.subject)}&chapter=${encodeURIComponent(chapter.title)}`;
  switch (milestone) {
    case 'learn':
      return `/study-now?${base}&mode=learn`;
    case 'drill':
      return `/study-now?${base}&mode=drill`;
    case 'review':
      return `/study-now?${base}&mode=review`;
    case 'test':
      return `/test?${base}&mode=chapter`;
  }
}

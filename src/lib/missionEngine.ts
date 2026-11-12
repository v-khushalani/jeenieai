/**
 * JEEnie Mission Engine — deterministic, zero-AI daily planner.
 *
 * Closed loop: attempts + tests → behaviour telemetry → score leaks →
 * cohort/phase policy → today's mission (3–4 tasks, each with a "why").
 *
 * Cohorts
 *  - foundation : long horizon (>240 days or Class 11). Sequential chapter order,
 *                 learn → repair, cumulative test every 14 days. No full mocks.
 *  - improver   : prepared students (91–240 days, or coverage ≥ 60%). Weakness-first
 *                 by Priority = weightage × (1 − accuracy). Chapter test every 3 days,
 *                 full mock every 7 days, day after a mock = analysis.
 *  - sprint     : ≤ 90 days. Phase 1 (>45d) high-yield coverage, Phase 2 (28–45d)
 *                 unit tests + formula speed, Phase 3 (≤27d) 72-hour mock loop.
 */
import { getWeightage } from './examWeightage';
import { normalizeSubject } from './subjectNormalization';

export type Cohort = 'foundation' | 'improver' | 'sprint';
export type Behaviour = 'careless' | 'concept' | 'slow' | 'clean' | 'unknown';
export type MissionKind = 'learn' | 'drill' | 'repair' | 'careless' | 'speed' | 'test' | 'mock' | 'analysis';

export const CARELESS_MAX_SEC = 45;
export const CONCEPT_MIN_SEC = 120;
export const SLOW_MIN_SEC = 240;
export const MARKS_LOST_PER_WRONG = 5; // +4 missed and −1 penalty (JEE/NEET)

export interface MissionChapter {
  id: string; subject: string; title: string;
  chapterNumber: number | null;
  attempts: number; accuracy: number; pendingMistakes: number;
  todayAttempts?: number; classLevel?: number | null; totalQuestions?: number; lastAttemptAt?: string | null;
}

export interface MissionAttempt {
  chapterId: string; isCorrect: boolean; timeSec: number | null;
  at: string; testSessionId: string | null;
}

export interface MissionTest {
  id: string; completedAt: string; totalQuestions: number; attempted: number;
  isFullMock: boolean; title: string;
}

export interface MissionTask {
  id: string; kind: MissionKind; title: string; why: string;
  href: string; target: number; minutes: number; chapterId?: string; subject?: string; testId?: string; lane?: 'coaching' | 'backlog' | 'adaptive';
}

export interface ScoreLeaks {
  careless: number; concept: number; otherWrong: number; unattempted: number;
  slowCorrect: number; total: number; topChapter: { id: string; title: string; marks: number } | null;
}

export interface Mission {
  cohort: Cohort; phase: string; headline: string; why: string;
  tasks: MissionTask[]; leaks: ScoreLeaks; nextTest: string; budgetMinutes: number; plannedMinutes: number; warnings: string[];
}

export interface MissionInput {
  exam: string; daysLeft: number; grade: number | null;
  chapters: MissionChapter[]; attempts: MissionAttempt[]; tests: MissionTest[];
  todayIso: string; cohortOverride?: Cohort | null; availableMinutes?: number;
  coachingChapterIds?: Record<string, string>; backlogChapterId?: string; completedTaskIds?: string[];
}

const DAY = 864e5;
const daysBetween = (a: string, b: string) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);

export function classifyAttempt(isCorrect: boolean, timeSec: number | null): Behaviour {
  if (!timeSec || timeSec <= 0) return 'unknown';
  if (!isCorrect && timeSec < CARELESS_MAX_SEC) return 'careless';
  if (!isCorrect && timeSec > CONCEPT_MIN_SEC) return 'concept';
  if (isCorrect && timeSec > SLOW_MIN_SEC) return 'slow';
  return 'clean';
}

export function deriveCohort(daysLeft: number, grade: number | null, coveragePct: number, override?: Cohort | null): Cohort {
  if (override) return override;
  if (daysLeft <= 90) return 'sprint';
  if (grade === 11 || daysLeft > 240) return coveragePct >= 60 && grade !== 11 ? 'improver' : 'foundation';
  return 'improver';
}

/** 72-hour loop: 0 = mock day, 1 = analysis, 2 = targeted retest. */
export function mockLoopStage(daysSinceLastMock: number | null): 0 | 1 | 2 {
  if (daysSinceLastMock === null || daysSinceLastMock >= 3) return 0;
  if (daysSinceLastMock <= 1) return 1;
  return 2;
}

export function priorityOf(exam: string, c: MissionChapter): number {
  const w = getWeightage(exam, c.subject, c.title);
  const acc = c.attempts >= 5 ? c.accuracy / 100 : 0.35; // untouched = assumed weak but not zero
  return w.expectedQ * (1 - acc) * 10 + c.pendingMistakes * 0.5;
}

export function computeLeaks(attempts: MissionAttempt[], tests: MissionTest[], chapters: MissionChapter[], todayIso: string): ScoreLeaks {
  const recent = attempts.filter((a) => daysBetween(a.at, todayIso) >= 0 && daysBetween(a.at, todayIso) <= 14);
  let careless = 0, concept = 0, otherWrong = 0, slowCorrect = 0;
  const byChapter = new Map<string, number>();
  recent.forEach((a) => {
    const b = classifyAttempt(a.isCorrect, a.timeSec);
    if (!a.isCorrect) {
      if (b === 'careless') careless += MARKS_LOST_PER_WRONG;
      else if (b === 'concept') concept += MARKS_LOST_PER_WRONG;
      else otherWrong += MARKS_LOST_PER_WRONG;
      byChapter.set(a.chapterId, (byChapter.get(a.chapterId) || 0) + MARKS_LOST_PER_WRONG);
    } else if (b === 'slow') slowCorrect += 1;
  });
  const unattempted = tests
    .filter((t) => daysBetween(t.completedAt, todayIso) >= 0 && daysBetween(t.completedAt, todayIso) <= 14)
    .reduce((s, t) => s + Math.max(0, t.totalQuestions - t.attempted) * 4, 0);
  let top: ScoreLeaks['topChapter'] = null;
  byChapter.forEach((marks, id) => {
    if (!top || marks > top.marks) top = { id, title: chapters.find((c) => c.id === id)?.title || 'Chapter', marks };
  });
  return { careless, concept, otherWrong, unattempted, slowCorrect, total: careless + concept + otherWrong + unattempted, topChapter: top };
}

const practice = (c: MissionChapter, mode: string, target: number) =>
  `/practice?${new URLSearchParams({ chapter_id: c.id, subject: c.subject, chapter: c.title, mode, target: String(target) })}`;
const chapterTest = (c: MissionChapter) =>
  `/tests?${new URLSearchParams({ chapter_id: c.id, subject: c.subject, chapter: c.title, mode: 'chapter' })}`;

/** One schedule policy for Today and the rolling week. Repeated weakness work is
 * deliberate only when evidence still calls for it; a chapter gets one block/day. */
export function buildMission(input: MissionInput): Mission {
  const { exam, daysLeft, grade, attempts, tests, todayIso } = input;
  const budgetMinutes = Math.max(15, Math.min(720, input.availableMinutes ?? 180));
  const chapters = input.chapters.filter(c =>
    (grade !== 11 && grade !== 12 || c.classLevel == null || c.classLevel === grade) &&
    (c.totalQuestions === undefined || c.totalQuestions > 0));
  const touched = chapters.filter(c => c.attempts >= 5);
  const coverage = chapters.length ? touched.length / chapters.length * 100 : 0;
  const cohort = deriveCohort(daysLeft, grade, coverage, input.cohortOverride);
  const leaks = computeLeaks(attempts, tests, chapters, todayIso);
  const tasks: MissionTask[] = [];
  const warnings: string[] = [];
  let remaining = budgetMinutes;
  const add = (task: Omit<MissionTask, 'id'>) => {
    const id = task.testId ? `analysis-${task.testId}` : `${task.kind}-${task.chapterId || 'all'}`;
    if (input.completedTaskIds?.includes(id)) return;
    if (task.chapterId && tasks.some(t => t.chapterId === task.chapterId)) return;
    if (tasks.some(t => t.id === id) || task.minutes > remaining) return;
    tasks.push({ ...task, id });
    remaining -= task.minutes;
  };
  const byPriority = [...chapters].sort((a, b) => priorityOf(exam, b) - priorityOf(exam, a) || a.id.localeCompare(b.id));
  const recentTests = [...tests].filter(t => daysBetween(t.completedAt, todayIso) >= 0)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const lastTest = recentTests[0];
  const lastMock = recentTests.find(t => t.isFullMock);
  const sinceTest = lastTest ? daysBetween(lastTest.completedAt, todayIso) : null;
  const sinceMock = lastMock ? daysBetween(lastMock.completedAt, todayIso) : null;
  const analysisDue = lastTest && sinceTest !== null && sinceTest <= 1 &&
    !input.completedTaskIds?.includes(`analysis-${lastTest.id}`);
  if (analysisDue) add({ kind: 'analysis', title: `Review: ${lastTest.title}`, testId: lastTest.id,
    why: 'Review wrong and skipped questions before another timed test. Confirm the review when you return.',
    href: `/test-results/${lastTest.id}`, target: 1, minutes: Math.min(45, budgetMinutes) });

  const phase = cohort === 'foundation' ? 'Build foundations' : cohort === 'improver' ? 'Strengthen preparation' :
    daysLeft > 45 ? 'Essential coverage' : daysLeft > 27 ? 'Consolidation' : 'Mock → review → retest';
  const mockDue = cohort === 'improver' ? sinceMock === null || sinceMock >= 7 :
    cohort === 'sprint' && daysLeft <= 27 && mockLoopStage(sinceMock) === 0;
  // Never substitute a chapter test for a full exam; never squeeze a 3h mock
  // into a shorter free-study budget. It is offered on a larger-budget day.
  if (mockDue && !analysisDue) {
    if (remaining >= 180) add({ kind: 'mock', title: 'Full-length mock', why: 'Use exam conditions. The next session is review, then targeted repair.',
      href: '/tests?mode=full&planner_task=mock-all', target: 1, minutes: 180 });
    else warnings.push('A full mock needs a separate 180-minute slot. Today stays within your available time.');
  }
  const subjects = ['Physics', 'Chemistry', /neet/i.test(exam) ? 'Biology' : 'Mathematics']
    .filter(s => chapters.some(c => normalizeSubject(c.subject) === s));
  const others = [...new Set(chapters.map(c => normalizeSubject(c.subject)))].filter(s => !subjects.includes(s));
  subjects.push(...others);
  // Rotate which subject comes first when a short day cannot fit all three.
  const offset = Math.abs(Math.floor(new Date(todayIso).getTime() / DAY)) % Math.max(1, subjects.length);
  const orderedSubjects = [...subjects.slice(offset), ...subjects.slice(0, offset)];
  const testInterval = cohort === 'foundation' ? 14 : cohort === 'improver' ? 3 : daysLeft > 45 ? 4 : 2;
  const checkpointDue = !analysisDue && !tasks.some(t => t.kind === 'mock') && remaining >= 105 &&
    (sinceTest === null ? touched.length >= 3 : sinceTest >= testInterval);
  const checkpoint = checkpointDue ? byPriority.find(c => c.attempts >= 5 && !Object.values(input.coachingChapterIds || {}).includes(c.id)) : undefined;
  if (checkpoint) add({ kind: 'test', title: `Checkpoint: ${checkpoint.title}`, why: 'A timed chapter check, followed by review.',
    href: chapterTest(checkpoint) + `&planner_task=test-${checkpoint.id}`, chapterId: checkpoint.id,
    subject: normalizeSubject(checkpoint.subject), target: 1, minutes: 60 });
  const practiceBudget = remaining;
  const selected: { chapter: MissionChapter; lane: 'coaching' | 'backlog' | 'adaptive' }[] = [];
  for (const subject of orderedSubjects) {
    const pool = byPriority.filter(c => normalizeSubject(c.subject) === subject && c.id !== checkpoint?.id);
    const coaching = pool.find(c => c.id === input.coachingChapterIds?.[subject]);
    const backlog = pool.find(c => c.id === input.backlogChapterId && c.id !== coaching?.id);
    const leakId = leaks.topChapter?.id;
    const weak = pool.find(c => c.id === leakId) || pool.find(c => c.pendingMistakes > 0 || c.attempts >= 5 && c.accuracy < 70);
    const sequential = [...pool].sort((a, b) => (a.chapterNumber ?? 999) - (b.chapterNumber ?? 999))
      .find(c => c.attempts < 40 || c.accuracy < 75);
    const chapter = coaching || backlog || (cohort === 'foundation' ? sequential || weak : weak || pool[0]);
    if (chapter) selected.push({ chapter, lane: coaching ? 'coaching' : backlog ? 'backlog' : 'adaptive' });
  }
  // One extra backlog block only if distinct from the subject's coaching block.
  const backlog = chapters.find(c => c.id === input.backlogChapterId);
  if (backlog && backlog.id !== checkpoint?.id && !selected.some(s => s.chapter.id === backlog.id) && practiceBudget >= 120)
    selected.push({ chapter: backlog, lane: 'backlog' });
  const slots = Math.min(selected.length, Math.floor(practiceBudget / 15));
  for (const { chapter: c, lane } of selected.slice(0, slots)) {
    const repair = c.pendingMistakes > 0;
    const minutes = Math.min(remaining, repair ? Math.min(20, Math.max(5, c.pendingMistakes * 4)) : lane === 'backlog' ? 45 : Math.max(15, Math.floor(practiceBudget / slots / 5) * 5));
    const kind: MissionKind = repair ? 'repair' : c.attempts < 5 ? 'learn' : 'drill';
    const target = repair ? Math.min(c.pendingMistakes, Math.max(1, Math.floor(minutes / 4)), 10) : Math.max(3, Math.floor(minutes / 3));
    const id = `${kind}-${c.id}`;
    const reasons = [lane === 'coaching' ? 'Matches your current coaching chapter.' : lane === 'backlog' ? 'Your selected backlog, within your active class scope.' :
      cohort === 'foundation' ? 'Next chapter in this subject’s sequence.' : c.attempts < 5 ? 'Not enough evidence yet: begin with a short baseline set.' : `${c.accuracy}% accuracy across ${c.attempts} recorded questions.`];
    if (repair) reasons.push(`${c.pendingMistakes} unresolved mistakes; retry the actual questions, not a random set.`);
    add({ kind, title: c.title, why: reasons.join(' '), subject: normalizeSubject(c.subject), lane,
      href: practice(c, repair ? 'revision' : 'learn', target) + `&planner_task=${encodeURIComponent(id)}`,
      chapterId: c.id, target, minutes });
  }
  const nextTest = mockDue ? 'Full mock due · reserve 3 hours' :
    cohort === 'foundation' && touched.length < 3 ? 'First checkpoint after 3 chapters have practice evidence' :
    `Chapter checkpoint ${sinceTest === null || sinceTest >= testInterval ? 'due' : `in ${testInterval - sinceTest} days`}`;
  if (!chapters.length) warnings.push('No question-backed chapters are available in your active scope. Change your setup or try again later.');
  if (slots + (checkpoint ? 1 : 0) < subjects.length && !tasks.some(t => t.kind === 'mock')) warnings.push('Short day: subjects rotate; unfinished work does not become an overdue pile.');
  return { cohort, phase, headline: tasks.some(t => t.kind === 'mock') ? 'Test day. Review comes next.' :
    analysisDue ? 'Turn your last test into your next improvement.' : touched.length ? 'A focused plan for today.' : 'Start small. Build evidence.',
    why: tasks[0]?.why || '', tasks, leaks, nextTest, budgetMinutes,
    plannedMinutes: tasks.reduce((s, t) => s + t.minutes, 0), warnings };
}

export function buildMissionWeek(input: MissionInput, weekdayMinutes: number, weekendMinutes: number): { date: string; mission: Mission }[] {
  const projectedTests = [...input.tests];
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(input.todayIso + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + i);
    const day = date.getUTCDay();
    const dateIso = date.toISOString().slice(0, 10);
    const mission = buildMission({ ...input, tests: projectedTests, todayIso: dateIso,
      daysLeft: Math.max(0, input.daysLeft - i), availableMinutes: day === 0 || day === 6 ? weekendMinutes : weekdayMinutes });
    // Calendar projection assumes scheduled tests happen; these synthetic rows
    // are never persisted or used as student performance evidence.
    const scheduled = mission.tasks.find(t => t.kind === 'test' || t.kind === 'mock');
    if (scheduled) projectedTests.push({ id: `projected-${dateIso}`, title: scheduled.title,
      completedAt: dateIso, totalQuestions: 0, attempted: 0, isFullMock: scheduled.kind === 'mock' });
    return { date: dateIso, mission };
  });
}

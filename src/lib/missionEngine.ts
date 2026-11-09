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
  todayAttempts?: number;
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
  href: string; target: number; minutes: number; chapterId?: string;
}

export interface ScoreLeaks {
  careless: number; concept: number; otherWrong: number; unattempted: number;
  slowCorrect: number; total: number; topChapter: { id: string; title: string; marks: number } | null;
}

export interface Mission {
  cohort: Cohort; phase: string; headline: string; why: string;
  tasks: MissionTask[]; leaks: ScoreLeaks; nextTest: string;
}

export interface MissionInput {
  exam: string; daysLeft: number; grade: number | null;
  chapters: MissionChapter[]; attempts: MissionAttempt[]; tests: MissionTest[];
  todayIso: string; cohortOverride?: Cohort | null;
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
  const recent = attempts.filter((a) => daysBetween(a.at, todayIso) <= 14);
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
    .filter((t) => daysBetween(t.completedAt, todayIso) <= 14)
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
  `/test?${new URLSearchParams({ chapter_id: c.id, subject: c.subject, chapter: c.title, mode: 'chapter' })}`;

export function buildMission(input: MissionInput): Mission {
  const { exam, daysLeft, grade, chapters, attempts, tests, todayIso } = input;
  const touched = chapters.filter((c) => c.attempts >= 5);
  const coverage = chapters.length ? Math.round((touched.length / chapters.length) * 100) : 0;
  const cohort = deriveCohort(daysLeft, grade, coverage, input.cohortOverride);
  const leaks = computeLeaks(attempts, tests, chapters, todayIso);
  const tasks: MissionTask[] = [];
  const push = (t: Omit<MissionTask, 'id'>) => { if (!tasks.some((x) => x.kind === t.kind && x.chapterId === t.chapterId)) tasks.push({ ...t, id: `${t.kind}-${t.chapterId || 'all'}` }); };

  const sortedSeq = [...chapters].sort((a, b) => a.subject.localeCompare(b.subject) || (a.chapterNumber ?? 999) - (b.chapterNumber ?? 999));
  const byPriority = [...chapters].sort((a, b) => priorityOf(exam, b) - priorityOf(exam, a));
  const weakest = byPriority.filter((c) => c.attempts >= 5 && c.accuracy < 70);
  const mostMistakes = [...chapters].filter((c) => c.pendingMistakes > 0).sort((a, b) => b.pendingMistakes - a.pendingMistakes)[0];
  const leakChapter = leaks.topChapter ? chapters.find((c) => c.id === leaks.topChapter!.id) : undefined;

  const lastTest = [...tests].sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const lastMock = tests.filter((t) => t.isFullMock).sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const sinceTest = lastTest ? daysBetween(lastTest.completedAt, todayIso) : null;
  const sinceMock = lastMock ? daysBetween(lastMock.completedAt, todayIso) : null;

  // Test-to-plan: a test in the last 48h always produces a post-mortem first.
  const analysisDue = lastTest && sinceTest !== null && sinceTest <= 1;
  if (analysisDue) {
    push({ kind: 'analysis', title: `Post-mortem: ${lastTest!.title || 'last test'}`, why: 'Test ke baad pehla kaam: har galat aur chhoota question samjho. Bina analysis agla test bekaar hai.', href: `/test-results/${lastTest!.id}`, target: 1, minutes: 30 });
  }

  let phase = '';
  let nextTest = '';

  if (cohort === 'foundation') {
    phase = 'Foundation build';
    const active = sortedSeq.find((c) => !(c.attempts >= 40 && c.accuracy >= 75)) || sortedSeq[0];
    if (active) push({ kind: 'learn', title: active.title, why: `Sequence mein agla chapter. ${active.attempts}/40 questions done — Easy se shuru, level khud badhega.`, href: practice(active, 'learn', 20), target: 20, minutes: 45, chapterId: active.id });
    const cumulativeDue = sinceTest === null ? touched.length >= 3 : sinceTest >= 14;
    if (cumulativeDue && touched.length) {
      const c = [...touched].sort((a, b) => a.accuracy - b.accuracy)[0];
      push({ kind: 'test', title: `Cumulative check: ${c.title}`, why: '14 din ho gaye bina test ke. Padha hua yaad hai ya nahi, test se pata chalega.', href: chapterTest(c), target: 1, minutes: 60, chapterId: c.id });
    }
    nextTest = sinceTest === null ? '3 chapters cover hone ke baad pehla test' : `Agla cumulative test ${Math.max(0, 14 - sinceTest)} din mein`;
  } else if (cohort === 'improver') {
    phase = 'Rank improvement';
    if (sinceMock !== null && sinceMock <= 1 && !analysisDue) {
      push({ kind: 'analysis', title: 'Mock analysis day', why: 'Mock ke agle din naya kuch nahi — sirf galtiyan.', href: `/test-results/${lastMock!.id}`, target: 1, minutes: 45 });
    }
    const drill = leakChapter || weakest[0] || byPriority[0];
    if (drill) push({ kind: 'drill', title: drill.title, why: leakChapter ? `Pichle 14 din mein yahan ${leaks.topChapter!.marks} marks gaye. Sabse bada leak, sabse pehle.` : `Weightage × kamzori sabse zyada. ${drill.attempts >= 5 ? drill.accuracy + '% accuracy ko 75% tak lao.' : 'Abhi tak touch nahi kiya.'}`, href: practice(drill, 'weak', 15), target: 15, minutes: 40, chapterId: drill.id });
    if (sinceMock === null || sinceMock >= 7) {
      push({ kind: 'mock', title: 'Full mock (3 hr)', why: sinceMock === null ? 'Abhi tak koi full mock nahi diya. Pehla mock asli starting point batayega.' : `${sinceMock} din ho gaye full mock ke bina. Exam stamina sirf mock se banti hai.`, href: '/test', target: 1, minutes: 180 });
    } else if (sinceTest === null || sinceTest >= 3) {
      const c = weakest[1] || weakest[0] || byPriority[1];
      if (c) push({ kind: 'test', title: `Chapter test: ${c.title}`, why: 'Har 3 din ek timed checkpoint — practice ka asli result yahin dikhta hai.', href: chapterTest(c), target: 1, minutes: 60, chapterId: c.id });
    }
    nextTest = sinceMock === null ? 'Full mock aaj' : `Agla full mock ${Math.max(0, 7 - sinceMock)} din mein`;
  } else {
    if (daysLeft > 45) {
      phase = 'Sprint · Phase 1 — high-yield coverage';
      const hy = byPriority.filter((c) => getWeightage(exam, c.subject, c.title).tier === 1 && !(c.attempts >= 40 && c.accuracy >= 75));
      const pick = hy[0] || byPriority[0];
      if (pick) push({ kind: 'learn', title: pick.title, why: `High-weightage chapter (~${getWeightage(exam, pick.subject, pick.title).expectedQ} Q/paper). 90 din mein pehle wahi jahan marks hain.`, href: practice(pick, 'learn', 25), target: 25, minutes: 60, chapterId: pick.id });
      if (sinceTest === null || sinceTest >= 4) {
        const c = touched.sort((a, b) => a.accuracy - b.accuracy)[0];
        if (c) push({ kind: 'test', title: `Chapter test: ${c.title}`, why: 'Har 4 din ek chapter test — jo cover kiya woh pakka hua ya nahi.', href: chapterTest(c), target: 1, minutes: 60, chapterId: c.id });
      }
      nextTest = 'Chapter test har 4 din';
    } else if (daysLeft > 27) {
      phase = 'Sprint · Phase 2 — unit tests + speed';
      const c = leakChapter || weakest[0] || byPriority[0];
      if (c) push({ kind: 'drill', title: c.title, why: 'Is chapter mein sabse zyada marks ja rahe hain. Aaj fix karo.', href: practice(c, 'weak', 20), target: 20, minutes: 45, chapterId: c.id });
      if (sinceTest === null || sinceTest >= 2) {
        const t = weakest[1] || byPriority[1] || c;
        if (t) push({ kind: 'test', title: `Unit test: ${t.title}`, why: 'Phase 2 mein har 2 din test. Speed aur accuracy dono train hote hain.', href: chapterTest(t), target: 1, minutes: 60, chapterId: t.id });
      }
      nextTest = 'Unit test har 2 din';
    } else {
      phase = 'Sprint · Phase 3 — 72-hour mock loop';
      const stage = mockLoopStage(sinceMock);
      if (stage === 0) push({ kind: 'mock', title: 'Full mock (exam conditions)', why: '72-hour loop ka Day 1. Exam time pe, phone door, +4/−1.', href: '/test', target: 1, minutes: 180 });
      else if (stage === 1 && lastMock && !analysisDue) push({ kind: 'analysis', title: 'Mock post-mortem', why: 'Loop ka Day 2: zero naya padhai. Sirf mock ki galtiyan.', href: `/test-results/${lastMock.id}`, target: 1, minutes: 60 });
      else if (stage === 2) {
        const c = leakChapter || weakest[0] || byPriority[0];
        if (c) push({ kind: 'drill', title: `Retest: ${c.title}`, why: 'Loop ka Day 3: mock mein jahan marks kate, wahi targeted retest.', href: practice(c, 'weak', 20), target: 20, minutes: 45, chapterId: c.id });
      }
      nextTest = stage === 0 ? 'Full mock aaj' : `Agla full mock ${3 - (sinceMock || 0)} din mein`;
    }
  }

  // Behaviour corrections — shared by every cohort.
  if (mostMistakes) push({ kind: 'repair', title: `Mistake repair: ${mostMistakes.title}`, why: `${mostMistakes.pendingMistakes} galat questions pending. Jo galti ek baar hui, woh exam mein dobara na ho.`, href: practice(mostMistakes, 'revision', Math.min(10, mostMistakes.pendingMistakes)), target: Math.min(10, mostMistakes.pendingMistakes), minutes: 20, chapterId: mostMistakes.id });
  if (leaks.careless >= 15 && leakChapter) push({ kind: 'careless', title: 'Careless trap review', why: `${leaks.careless} marks 45 second se kam mein galat answer se gaye. Aata tha, jaldi kiya. Aaj dheere, units check karke.`, href: practice(leakChapter, 'revision', 8), target: 8, minutes: 15 });
  if (leaks.slowCorrect >= 5 && touched[0]) {
    const c = [...touched].sort((a, b) => b.accuracy - a.accuracy)[0];
    push({ kind: 'speed', title: `Speed drill: ${c.title}`, why: `${leaks.slowCorrect} sahi answers mein 4+ minute lage. Exam mein itna time nahi milega.`, href: practice(c, 'learn', 10), target: 10, minutes: 15, chapterId: c.id });
  }

  const final = tasks.slice(0, 4);
  const lead = final[0];
  const headline = leaks.total > 0
    ? `${leaks.total} marks leak ho rahe hain — aaj ${Math.min(leaks.total, Math.round(leaks.total * 0.4))} wapas lao`
    : touched.length === 0 ? 'Pehla din: shuru karo, data khud plan banayega' : 'Aaj ka mission';
  return { cohort, phase, headline, why: lead?.why || '', tasks: final, leaks, nextTest };
}

import { getWeightage, type Tier } from './examWeightage';

export interface CoachChapter {
  id: string; subject: string; title: string;
  attempts: number; accuracy: number; pendingMistakes: number;
  lastAttemptAt: string | null;
}
export type Phase = 'sprint' | 'consolidate' | 'simulate';
export interface HitTask { kind: 'sprint' | 'drill' | 'revise' | 'mock'; title: string; detail: string; href: string; target: number; chapterId?: string }
export interface CoachPlan {
  daysLeft: number; phase: Phase;
  masteredCount: number; totalChapters: number;
  projected: [number, number]; reachable: [number, number]; maxMarks: number;
  tasks: HitTask[];
  skip: string[]; // honest "drop these for now"
  unlock: { chapter: string; marks: number } | null;
}

export const MASTERED_ACC = 75;
export const MASTERED_MIN_Q = 40;

export const isMastered = (c: CoachChapter) => c.accuracy >= MASTERED_ACC && c.attempts >= MASTERED_MIN_Q;

export function phaseFor(daysLeft: number): Phase {
  if (daysLeft > 45) return 'sprint';
  if (daysLeft > 15) return 'consolidate';
  return 'simulate';
}

const practiceHref = (c: CoachChapter, mode: string, target: number) => {
  const p = new URLSearchParams({ chapter_id: c.id, subject: c.subject, chapter: c.title, mode, target: String(target) });
  return `/practice?${p.toString()}`;
};

/** Expected marks a chapter yields at a given accuracy (negative marking aware). */
const chapterMarks = (expectedQ: number, acc: number, neg: boolean) => {
  const a = Math.max(0, Math.min(1, acc / 100));
  const perQ = neg ? 4 * a - 1 * (1 - a) * 0.6 : 4 * a; // assume ~40% of unsure skipped
  return Math.max(0, expectedQ * perQ);
};

export function buildCoachPlan(exam: string, chapters: CoachChapter[], daysLeft: number, dailyHours = 6): CoachPlan {
  const neg = /jee|neet/i.test(exam);
  const maxMarks = /neet/i.test(exam) ? 720 : 300;
  const phase = phaseFor(daysLeft);
  const enriched = chapters.map((c) => ({ c, w: getWeightage(exam, c.subject, c.title) }));
  const totalExpected = enriched.reduce((s, e) => s + e.w.expectedQ, 0) || 1;
  const scale = (maxMarks / 4) / totalExpected; // normalise to paper question count

  // Current projection: only attempted chapters count
  const cur = enriched.reduce((s, { c, w }) => s + (c.attempts >= 10 ? chapterMarks(w.expectedQ * scale, c.accuracy, neg) : 0), 0);

  // Realistic reach: hours available → greedily master highest-ROI chapters
  const hoursLeft = Math.max(0, daysLeft) * dailyHours * 0.7; // 30% kept for revision/mocks
  const candidates = enriched
    .filter(({ c }) => !isMastered(c))
    .map((e) => {
      const done = Math.min(1, e.c.attempts / MASTERED_MIN_Q);
      const hrs = e.w.effortHrs * (1 - done * 0.6);
      const gain = chapterMarks(e.w.expectedQ * scale, 80, neg) - (e.c.attempts >= 10 ? chapterMarks(e.w.expectedQ * scale, e.c.accuracy, neg) : 0);
      return { ...e, hrs, gain, roi: gain / Math.max(1, hrs) };
    })
    .sort((a, b) => b.roi - a.roi || a.c.id.localeCompare(b.c.id));
  let budget = hoursLeft; let reach = cur; const picked: typeof candidates = [];
  for (const k of candidates) { if (k.hrs <= budget) { budget -= k.hrs; reach += k.gain; picked.push(k); } }
  const skip = phase !== 'sprint' ? candidates.filter((k) => !picked.includes(k) && k.w.tier === 3).slice(0, 3).map((k) => k.c.title) : [];

  const band = (v: number): [number, number] => {
    const lo = Math.max(0, Math.round((v * 0.88) / 5) * 5);
    const hi = Math.min(maxMarks, Math.round((v * 1.08) / 5) * 5);
    return [lo, Math.max(lo, hi)];
  };

  // Priority = weightage × weakness × urgency
  const urgency = phase === 'sprint' ? 1 : phase === 'consolidate' ? 1.4 : 1.8;
  const score = ({ c, w }: (typeof enriched)[number]) => {
    const weakness = c.attempts === 0 ? 0.8 : Math.max(0.1, (100 - c.accuracy) / 100) + c.pendingMistakes * 0.02;
    const tierBoost: Record<Tier, number> = { 1: 1.5, 2: 1, 3: phase === 'sprint' ? 0.7 : 0.25 };
    return w.expectedQ * weakness * tierBoost[w.tier] * urgency;
  };
  // Deterministic: equal scores always break ties by chapter id, so refreshes never reshuffle
  const open = enriched.filter(({ c }) => !isMastered(c)).sort((a, b) => score(b) - score(a) || a.c.id.localeCompare(b.c.id));
  const weak = open.filter(({ c }) => c.attempts >= 10 && c.accuracy < 60);
  const fresh = open.filter(({ c }) => c.attempts < 10);

  const tasks: HitTask[] = [];
  if (phase !== 'simulate') {
    const s = (phase === 'sprint' ? fresh[0] || open[0] : open[0]);
    if (s) tasks.push({ kind: 'sprint', title: s.c.title, detail: `${s.c.subject} · ~${Math.round(s.w.expectedQ)} Q/paper`, href: practiceHref(s.c, 'learn', 20), target: 20, chapterId: s.c.id });
    const d = weak.find((e) => e.c.id !== s?.c.id) || open.find((e) => e.c.id !== s?.c.id && e.c.attempts > 0);
    if (d) tasks.push({ kind: 'drill', title: d.c.title, detail: `${Math.round(d.c.accuracy)}% → 70%+ target`, href: practiceHref(d.c, 'weak', 15), target: 15, chapterId: d.c.id });
  }
  // Spaced revision: chapter last touched 7+ days ago
  const stale = enriched
    .filter(({ c }) => c.attempts >= 10 && c.lastAttemptAt && (Date.now() - new Date(c.lastAttemptAt).getTime()) / 864e5 >= 7)
    .sort((a, b) => new Date(a.c.lastAttemptAt!).getTime() - new Date(b.c.lastAttemptAt!).getTime() || a.c.id.localeCompare(b.c.id))[0];
  if (phase === 'sprint' && stale) {
    tasks.push({ kind: 'revise', title: stale.c.title, detail: '10-question recap (7+ days old)', href: practiceHref(stale.c, 'revision', 10), target: 10, chapterId: stale.c.id });
  } else if (phase !== 'sprint') {
    tasks.push({ kind: 'mock', title: phase === 'simulate' ? 'Full-length mock' : 'Timed sectional test', detail: phase === 'simulate' ? '3 hours · then review every mistake' : '1 hour · exam pattern', href: '/tests', target: 1 });
  }
  if (phase === 'simulate' && weak[0]) {
    tasks.push({ kind: 'revise', title: weak[0].c.title, detail: 'Error revision only — no new chapters', href: practiceHref(weak[0].c, 'weak', 10), target: 10, chapterId: weak[0].c.id });
  }

  const u = candidates.find((k) => k.c.attempts > 0) || candidates[0];
  return {
    daysLeft, phase,
    masteredCount: chapters.filter(isMastered).length,
    totalChapters: chapters.length,
    projected: band(cur), reachable: band(Math.max(cur, reach)), maxMarks,
    tasks: tasks.slice(0, 3), skip,
    unlock: u ? { chapter: u.c.title, marks: Math.max(1, Math.round(u.gain)) } : null,
  };
}

/* ---------------- Exam roadmap: months → weeks (derived, never stored) ---------------- */
export interface RoadmapChapterSlot { id: string; title: string; subject: string; tier: Tier; expectedQ: number; accuracy: number; attempts: number; status: 'mastered' | 'active' | 'scheduled' | 'dropped' }
export interface RoadmapMonth { index: number; label: string; from: string; to: string; focus: string; kind: 'learn' | 'mix' | 'mock'; chapters: RoadmapChapterSlot[] }
export interface WeekSprint { from: string; to: string; chapters: RoadmapChapterSlot[]; questionTarget: number; test: string }
export interface ExamRoadmap { months: RoadmapMonth[]; week: WeekSprint; dropped: RoadmapChapterSlot[]; masteredCount: number; onTrack: boolean; behindBy: number }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

export function buildExamRoadmap(exam: string, chapters: CoachChapter[], daysLeft: number, todayIso: string, dailyHours = 6): ExamRoadmap {
  const today = new Date(todayIso + 'T00:00:00Z');
  const mockDays = Math.min(daysLeft, Math.max(7, Math.round(daysLeft * 0.15)));
  const learnDays = Math.max(0, daysLeft - mockDays);
  const learnHoursPerDay = dailyHours * 0.7;

  const slots = chapters.map((c) => {
    const w = getWeightage(exam, c.subject, c.title);
    const done = Math.min(1, c.attempts / MASTERED_MIN_Q);
    const hrs = isMastered(c) ? 0 : w.effortHrs * (1 - done * 0.6);
    const weakness = c.attempts === 0 ? 0.8 : Math.max(0.1, (100 - c.accuracy) / 100);
    return { c, w, hrs, prio: (w.expectedQ / Math.max(1, w.effortHrs)) * (1 + weakness) * (w.tier === 1 ? 1.5 : w.tier === 2 ? 1 : 0.6) };
  });
  const open = slots.filter((s) => s.hrs > 0).sort((a, b) => b.prio - a.prio || a.c.id.localeCompare(b.c.id));

  // Lay chapters on a timeline by effort; whatever doesn't fit before mock phase is honestly dropped.
  let cursor = 0; // learning hours consumed
  const capacity = learnDays * learnHoursPerDay;
  const placed: { s: (typeof open)[number]; day: number }[] = [];
  const dropped: typeof open = [];
  for (const s of open) {
    if (cursor + s.hrs <= capacity) { placed.push({ s, day: Math.floor(cursor / learnHoursPerDay) }); cursor += s.hrs; }
    else dropped.push(s);
  }
  const toSlot = (s: (typeof slots)[number], status: RoadmapChapterSlot['status']): RoadmapChapterSlot => ({
    id: s.c.id, title: s.c.title, subject: s.c.subject, tier: s.w.tier, expectedQ: Math.round(s.w.expectedQ * 10) / 10,
    accuracy: Math.round(s.c.accuracy), attempts: s.c.attempts, status,
  });

  // Months of ~30 days; the final block is always the mock phase.
  const months: RoadmapMonth[] = [];
  const nLearn = Math.max(learnDays > 0 ? 1 : 0, Math.round(learnDays / 30));
  const span = nLearn ? learnDays / nLearn : 0;
  for (let i = 0; i < nLearn; i++) {
    const a = Math.round(i * span), b = Math.round((i + 1) * span);
    const inMonth = placed.filter((p) => p.day >= a && p.day < b);
    months.push({
      index: i, label: `Month ${i + 1}`, from: iso(addDays(today, a)), to: iso(addDays(today, b - 1)),
      focus: i === 0 ? 'High-scoring chapters pehle' : i === nLearn - 1 ? 'Baaki core chapters + weak spots' : 'Core chapters + timed tests',
      kind: i === 0 ? 'learn' : 'mix',
      chapters: inMonth.map((p, k) => toSlot(p.s, i === 0 && k < 3 ? 'active' : 'scheduled')),
    });
  }
  months.push({
    index: months.length, label: nLearn ? 'Final stretch' : 'Exam mode', from: iso(addDays(today, learnDays)), to: iso(addDays(today, daysLeft - 1)),
    focus: 'Full mocks, galtiyon ka revision — koi naya chapter nahi', kind: 'mock',
    chapters: slots.filter((s) => s.hrs === 0).map((s) => toSlot(s, 'mastered')),
  });

  // Current week (Mon–Sun IST): first 3 placed chapters, one per subject where possible.
  const dow = (today.getUTCDay() + 6) % 7;
  const weekFrom = addDays(today, -dow), weekTo = addDays(weekFrom, 6);
  const pick: (typeof placed)[number][] = [];
  for (const p of placed) { if (pick.length < 3 && !pick.some((q) => q.s.c.subject === p.s.c.subject)) pick.push(p); }
  for (const p of placed) { if (pick.length < 3 && !pick.includes(p)) pick.push(p); }
  const weekChapters = pick.map((p) => toSlot(p.s, 'active'));
  const questionTarget = learnDays > 0 ? Math.max(60, weekChapters.length * 40) : 0;

  // Honesty: compare with "ideal pace" — fraction of syllabus that should be mastered by now is unknown,
  // so we flag behind only when dropped chapters exist.
  return {
    months, dropped: dropped.map((s) => toSlot(s, 'dropped')),
    week: { from: iso(weekFrom), to: iso(weekTo), chapters: weekChapters, questionTarget, test: learnDays > 0 ? 'Sunday: in chapters ka 45-min test' : 'Is hafte 2 full mocks' },
    masteredCount: slots.filter((s) => s.hrs === 0).length,
    onTrack: dropped.length === 0, behindBy: dropped.length,
  };
}

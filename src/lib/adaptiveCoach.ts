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
    .sort((a, b) => b.roi - a.roi);
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
  const open = enriched.filter(({ c }) => !isMastered(c)).sort((a, b) => score(b) - score(a));
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
    .sort((a, b) => new Date(a.c.lastAttemptAt!).getTime() - new Date(b.c.lastAttemptAt!).getTime())[0];
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

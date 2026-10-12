// JEEnie Adaptive Core — deterministic, zero-AI-cost.
// 1) Separate track per goal: JEE Main, JEE Advanced, NEET. Each has its own L1/L2/L3,
//    persisted separately so progress in one track never leaks into another.
// 2) Rolling window of the last WINDOW answers at (or above) the student's level:
//    promote at >= PROMOTE_HITS/WINDOW, demote at <= DEMOTE_HITS/WINDOW. One or two
//    silly mistakes never drop a level. Easier-than-level corrects don't count.
// 3) Questions are mapped to a track tier from (exam tag, difficulty) — see tierOf.
// 4) Mistake repair: previously wrong questions are interleaved (~30%) via interleaveRepair.
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Track = 'main' | 'advanced' | 'neet';
export type Tier = 1 | 2 | 3;

export const WINDOW = 5;
export const PROMOTE_HITS = 4; // 80%
export const DEMOTE_HITS = 1;  // 20%
export const REPAIR_SHARE = 0.3;

export interface LadderState { tier: Tier; window: boolean[] }
export const INITIAL_LADDER: LadderState = { tier: 1, window: [] };

export function normalizeDifficulty(d?: string | null): Difficulty {
  const v = (d || '').toLowerCase();
  if (v === 'easy') return 'Easy';
  if (v === 'hard') return 'Hard';
  return 'Medium';
}

export function trackFor(targetExam?: string | null): Track {
  const v = (targetExam || '').toLowerCase();
  if (v.includes('neet') || v.includes('pcb')) return 'neet';
  if (v.includes('adv')) return 'advanced';
  return 'main';
}

const isAdvancedQ = (exam?: string | null) => /adv/i.test(exam || '');

/** Which tier of the student's track a question belongs to. */
export function tierOf(track: Track, q: { difficulty?: string | null; exam?: string | null }): Tier {
  const d = normalizeDifficulty(q.difficulty);
  if (track === 'advanced') {
    // L1 = Main-level prerequisites, L2 = Advanced standard, L3 = Advanced hard.
    if (!isAdvancedQ(q.exam)) return d === 'Easy' ? 1 : d === 'Medium' ? 1 : 2;
    return d === 'Hard' ? 3 : 2;
  }
  return d === 'Easy' ? 1 : d === 'Medium' ? 2 : 3;
}

export const TRACK_NAME: Record<Track, string> = { main: 'Mains', advanced: 'Advanced', neet: 'NEET' };
export const TIER_NAME: Record<Track, Record<Tier, string>> = {
  main: { 1: 'Foundation', 2: 'Mains Standard', 3: 'Mains Challenger' },
  advanced: { 1: 'Concept Anchor', 2: 'Multi-Concept', 3: 'Ranker' },
  neet: { 1: 'NCERT Recall', 2: 'NEET Standard', 3: 'Speed & Trap' },
};
export const levelLabel = (track: Track, tier: Tier) => `${TRACK_NAME[track]} · L${tier} ${TIER_NAME[track][tier]}`;

export function stepLadder(
  s: LadderState, qTier: Tier, isCorrect: boolean,
): { next: LadderState; changed: 'up' | 'down' | null } {
  // Easier-than-level correct answers don't count; wrong answers at any tier >= level-1 do.
  if (isCorrect && qTier < s.tier) return { next: s, changed: null };
  if (!isCorrect && qTier < s.tier - 1) return { next: s, changed: null };
  const window = [...s.window, isCorrect].slice(-WINDOW);
  const hits = window.filter(Boolean).length;
  if (window.length >= WINDOW && hits >= PROMOTE_HITS && s.tier < 3) {
    return { next: { tier: (s.tier + 1) as Tier, window: [] }, changed: 'up' };
  }
  if (window.length >= WINDOW && hits <= DEMOTE_HITS && s.tier > 1) {
    return { next: { tier: (s.tier - 1) as Tier, window: [] }, changed: 'down' };
  }
  return { next: { tier: s.tier, window }, changed: null };
}

/** Progress text toward next level, e.g. "3/5 · need 4 right". */
export function ladderProgress(s: LadderState) {
  const hits = s.window.filter(Boolean).length;
  return { hits, seen: s.window.length, need: PROMOTE_HITS, max: s.tier === 3 };
}

const key = (userId: string, track: Track, scope: string) => `jeenie_ladder2:${userId}:${track}:${scope}`;

export function loadLadder(userId: string | undefined, track: Track, scope: string): LadderState {
  if (!userId) return INITIAL_LADDER;
  try {
    const raw = localStorage.getItem(key(userId, track, scope));
    if (!raw) return INITIAL_LADDER;
    const p = JSON.parse(raw);
    const tier = [1, 2, 3].includes(p.tier) ? (p.tier as Tier) : 1;
    const window = Array.isArray(p.window) ? p.window.map(Boolean).slice(-WINDOW) : [];
    return { tier, window };
  } catch { return INITIAL_LADDER; }
}

export function saveLadder(userId: string | undefined, track: Track, scope: string, s: LadderState) {
  if (!userId) return;
  try { localStorage.setItem(key(userId, track, scope), JSON.stringify(s)); } catch { /* ignore */ }
}

/** Order: target tier first, then nearest tiers. Random within bucket. */
export function orderPoolByLevel<T extends { difficulty?: string | null; exam?: string | null }>(
  pool: T[], track: Track, target: Tier,
): T[] {
  const b: Record<Tier, T[]> = { 1: [], 2: [], 3: [] };
  pool.forEach((q) => b[tierOf(track, q)].push(q));
  ([1, 2, 3] as Tier[]).forEach((k) => b[k].sort(() => Math.random() - 0.5));
  const order: Tier[] = target === 1 ? [1, 2, 3] : target === 3 ? [3, 2, 1] : [2, 1, 3];
  return order.flatMap((k) => b[k]);
}

/** Put a repair question at every ~3rd slot (≈30%), keeping total = take. */
export function interleaveRepair<T extends { id: string }>(fresh: T[], repair: T[], take: number): T[] {
  const ids = new Set(fresh.map((q) => q.id));
  const rep = repair.filter((q) => !ids.has(q.id)).slice(0, Math.round(take * REPAIR_SHARE));
  const out: T[] = []; let f = 0; let r = 0;
  while (out.length < take && (f < fresh.length || r < rep.length)) {
    const slotRepair = (out.length + 1) % 3 === 0;
    if (slotRepair && r < rep.length) out.push(rep[r++]);
    else if (f < fresh.length) out.push(fresh[f++]);
    else out.push(rep[r++]);
  }
  return out;
}

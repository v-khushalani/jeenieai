// Deterministic difficulty ladder: Easy → Medium → Hard, per student per scope.
// Promote after PROMOTE_STREAK correct in a row at current level (or above).
// Demote after DEMOTE_STREAK wrong in a row. Persisted locally per scope.
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export const LEVELS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
export const PROMOTE_STREAK = 3;
export const DEMOTE_STREAK = 2;

export interface LadderState { level: Difficulty; streakRight: number; streakWrong: number }
export const INITIAL_LADDER: LadderState = { level: 'Easy', streakRight: 0, streakWrong: 0 };

export function normalizeDifficulty(d?: string | null): Difficulty {
  const v = (d || '').toLowerCase();
  if (v === 'easy') return 'Easy';
  if (v === 'hard') return 'Hard';
  return 'Medium';
}

export function stepLadder(
  s: LadderState, qDifficulty: string | null | undefined, isCorrect: boolean,
): { next: LadderState; changed: 'up' | 'down' | null } {
  const idx = LEVELS.indexOf(s.level);
  const qIdx = LEVELS.indexOf(normalizeDifficulty(qDifficulty));
  if (isCorrect) {
    // Correct answers below current level don't count toward promotion.
    const right = qIdx >= idx ? s.streakRight + 1 : s.streakRight;
    if (right >= PROMOTE_STREAK && idx < 2) {
      return { next: { level: LEVELS[idx + 1], streakRight: 0, streakWrong: 0 }, changed: 'up' };
    }
    return { next: { ...s, streakRight: right, streakWrong: 0 }, changed: null };
  }
  const wrong = s.streakWrong + 1;
  if (wrong >= DEMOTE_STREAK && idx > 0) {
    return { next: { level: LEVELS[idx - 1], streakRight: 0, streakWrong: 0 }, changed: 'down' };
  }
  return { next: { ...s, streakRight: 0, streakWrong: wrong }, changed: null };
}

const key = (userId: string, scope: string) => `jeenie_ladder:${userId}:${scope}`;

export function loadLadder(userId: string | undefined, scope: string): LadderState {
  if (!userId) return INITIAL_LADDER;
  try {
    const raw = localStorage.getItem(key(userId, scope));
    if (!raw) return INITIAL_LADDER;
    const p = JSON.parse(raw);
    if (!LEVELS.includes(p.level)) return INITIAL_LADDER;
    return { level: p.level, streakRight: Number(p.streakRight) || 0, streakWrong: Number(p.streakWrong) || 0 };
  } catch { return INITIAL_LADDER; }
}

export function saveLadder(userId: string | undefined, scope: string, s: LadderState) {
  if (!userId) return;
  try { localStorage.setItem(key(userId, scope), JSON.stringify(s)); } catch { /* ignore */ }
}

/** Order: target level first, then nearest levels. Random within bucket. */
export function orderPoolByLevel<T extends { difficulty?: string | null }>(pool: T[], target: Difficulty): T[] {
  const b: Record<Difficulty, T[]> = { Easy: [], Medium: [], Hard: [] };
  pool.forEach((q) => b[normalizeDifficulty(q.difficulty)].push(q));
  LEVELS.forEach((k) => b[k].sort(() => Math.random() - 0.5));
  const order: Difficulty[] = target === 'Easy' ? ['Easy', 'Medium', 'Hard']
    : target === 'Hard' ? ['Hard', 'Medium', 'Easy'] : ['Medium', 'Easy', 'Hard'];
  return order.flatMap((k) => b[k]);
}

export const LEVEL_LABEL: Record<Difficulty, string> = {
  Easy: 'Level 1 · Basics', Medium: 'Level 2 · Mains', Hard: 'Level 3 · Advanced',
};

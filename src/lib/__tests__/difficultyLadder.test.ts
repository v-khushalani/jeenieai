import { describe, it, expect } from 'vitest';
import { stepLadder, INITIAL_LADDER, orderPoolByLevel, tierOf, trackFor, interleaveRepair, type LadderState } from '../difficultyLadder';

const run = (s: LadderState, tier: 1 | 2 | 3, answers: boolean[]) => {
  let changed: string | null = null;
  for (const a of answers) { const r = stepLadder(s, tier, a); s = r.next; changed = r.changed ?? changed; }
  return { s, changed };
};

describe('adaptive core', () => {
  it('maps goals to separate tracks', () => {
    expect(trackFor('JEE Main')).toBe('main');
    expect(trackFor('JEE Advanced')).toBe('advanced');
    expect(trackFor('NEET')).toBe('neet');
  });
  it('advanced track treats Main questions as L1/L2 and Adv hard as L3', () => {
    expect(tierOf('advanced', { exam: 'JEE Main', difficulty: 'Hard' })).toBe(2);
    expect(tierOf('advanced', { exam: 'JEE Main', difficulty: 'Easy' })).toBe(1);
    expect(tierOf('advanced', { exam: 'JEE Advanced', difficulty: 'Hard' })).toBe(3);
  });
  it('promotes at 4/5, not before 5 attempts', () => {
    expect(run(INITIAL_LADDER, 1, [true, true, true, true]).s.tier).toBe(1);
    const r = run(INITIAL_LADDER, 1, [true, false, true, true, true]);
    expect(r.s.tier).toBe(2);
    expect(r.changed).toBe('up');
  });
  it('two silly mistakes never demote', () => {
    const r = run({ tier: 2, window: [] }, 2, [false, false, true, true, false]);
    expect(r.s.tier).toBe(2);
  });
  it('demotes only at <=1/5, never below L1', () => {
    expect(run({ tier: 3, window: [] }, 3, [false, false, true, false, false]).s.tier).toBe(2);
    expect(run(INITIAL_LADDER, 1, [false, false, false, false, false, false]).s.tier).toBe(1);
  });
  it('easier corrects do not count toward promotion', () => {
    expect(run({ tier: 2, window: [] }, 1, [true, true, true, true, true, true]).s.tier).toBe(2);
  });
  it('orders target tier first', () => {
    const out = orderPoolByLevel([{ difficulty: 'hard' }, { difficulty: 'easy' }, { difficulty: 'medium' }], 'main', 2);
    expect(out[0].difficulty).toBe('medium');
  });
  it('interleaves ~30% repair', () => {
    const fresh = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}` }));
    const rep = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));
    const out = interleaveRepair(fresh, rep, 10);
    expect(out).toHaveLength(10);
    expect(out.filter((q) => q.id.startsWith('r'))).toHaveLength(3);
  });
});

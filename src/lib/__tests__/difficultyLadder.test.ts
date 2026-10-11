import { describe, it, expect } from 'vitest';
import { stepLadder, INITIAL_LADDER, orderPoolByLevel } from '../difficultyLadder';

describe('difficultyLadder', () => {
  it('starts Easy and promotes after 3 correct', () => {
    let s = INITIAL_LADDER;
    for (let i = 0; i < 2; i++) s = stepLadder(s, 'easy', true).next;
    expect(s.level).toBe('Easy');
    const r = stepLadder(s, 'easy', true);
    expect(r.changed).toBe('up');
    expect(r.next.level).toBe('Medium');
  });
  it('easy correct does not promote from Medium', () => {
    let s = { level: 'Medium' as const, streakRight: 0, streakWrong: 0 };
    for (let i = 0; i < 5; i++) s = stepLadder(s, 'easy', true).next;
    expect(s.level).toBe('Medium');
  });
  it('demotes after 2 wrong, never below Easy', () => {
    let s = { level: 'Hard' as const, streakRight: 2, streakWrong: 0 };
    s = stepLadder(s, 'hard', false).next as any;
    const r = stepLadder(s, 'hard', false);
    expect(r.next.level).toBe('Medium');
    let e = INITIAL_LADDER;
    for (let i = 0; i < 4; i++) e = stepLadder(e, 'easy', false).next;
    expect(e.level).toBe('Easy');
  });
  it('orders target level first', () => {
    const out = orderPoolByLevel([{ difficulty: 'hard' }, { difficulty: 'easy' }, { difficulty: 'medium' }], 'Medium');
    expect(out[0].difficulty).toBe('medium');
  });
});

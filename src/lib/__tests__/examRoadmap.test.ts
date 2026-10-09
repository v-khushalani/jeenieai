import { describe, it, expect } from 'vitest';
import { buildExamRoadmap } from '../adaptiveCoach';
const ch = (i: number) => ({ id: `c${i}`, subject: ['Physics', 'Chemistry', 'Mathematics'][i % 3], title: `Chapter ${i}`, attempts: 0, accuracy: 0, pendingMistakes: 0, lastAttemptAt: null });
const chapters = Array.from({ length: 90 }, (_, i) => ch(i));
describe('exam roadmap', () => {
  it('last block is always mocks with no new chapters scheduled', () => {
    const r = buildExamRoadmap('JEE', chapters, 90, '2026-10-09');
    expect(r.months.at(-1)!.kind).toBe('mock');
    expect(r.months.length).toBe(4);
  });
  it('honestly drops chapters when time is too short', () => {
    expect(buildExamRoadmap('JEE', chapters, 20, '2026-10-09').dropped.length).toBeGreaterThan(0);
  });
  it('week has 3 chapters from different subjects', () => {
    const w = buildExamRoadmap('JEE', chapters, 90, '2026-10-09').week;
    expect(new Set(w.chapters.map((c) => c.subject)).size).toBe(3);
    expect(w.from).toBe('2026-10-05');
  });
});

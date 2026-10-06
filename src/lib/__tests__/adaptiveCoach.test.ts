import { describe, it, expect } from 'vitest';
import { buildCoachPlan, phaseFor, isMastered } from '../adaptiveCoach';
import { getWeightage } from '../examWeightage';

const ch = (title: string, subject: string, attempts = 0, accuracy = 0) => ({ id: title, subject, title, attempts, accuracy, pendingMistakes: 0, lastAttemptAt: null });

describe('adaptive coach', () => {
  it('phases by days left', () => {
    expect(phaseFor(100)).toBe('sprint');
    expect(phaseFor(30)).toBe('consolidate');
    expect(phaseFor(10)).toBe('simulate');
  });
  it('mastered needs 75% and 40 questions', () => {
    expect(isMastered(ch('a', 'Physics', 40, 75))).toBe(true);
    expect(isMastered(ch('a', 'Physics', 39, 90))).toBe(false);
  });
  it('modern physics outranks rotational motion', () => {
    expect(getWeightage('JEE', 'Physics', 'Modern Physics').tier).toBeLessThan(getWeightage('JEE', 'Physics', 'Rotational Motion').tier);
  });
  it('fresh student gets 0 projected marks (no false hope)', () => {
    const p = buildCoachPlan('JEE', [ch('Modern Physics', 'Physics'), ch('Vectors', 'Mathematics')], 100);
    expect(p.projected[0]).toBe(0);
  });
  it('final 15 days: no new chapter sprint', () => {
    const p = buildCoachPlan('JEE', [ch('Modern Physics', 'Physics', 20, 40)], 10);
    expect(p.tasks.some((t) => t.kind === 'sprint')).toBe(false);
    expect(p.tasks.some((t) => t.kind === 'mock')).toBe(true);
  });
  it('task links open practice directly', () => {
    const p = buildCoachPlan('JEE', [ch('Modern Physics', 'Physics')], 100);
    expect(p.tasks[0].href.startsWith('/practice?')).toBe(true);
  });
});

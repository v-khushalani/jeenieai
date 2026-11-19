import { describe, it, expect } from 'vitest';
import { orderForNta, buildNtaLayout, ntaStatus, pickNtaPaper } from '../ntaLayout';

const qs = [
  { id: 1, subject: 'Mathematics', question_type: 'single_correct' },
  { id: 2, subject: 'Physics', question_type: 'numerical_int' },
  { id: 3, subject: 'Chemistry', question_type: 'single_correct' },
  { id: 4, subject: 'Physics', question_type: 'single_correct' },
];
const subjects = ['Physics', 'Chemistry', 'Mathematics'];

describe('NTA layout', () => {
  it('orders Physics → Chemistry → Maths, MCQs before numericals', () => {
    expect(orderForNta(qs, subjects).map((q) => q.id)).toEqual([4, 2, 3, 1]);
  });
  it('groups into subject tabs with Section A/B', () => {
    const l = buildNtaLayout(orderForNta(qs, subjects));
    expect(l.map((s) => s.subject)).toEqual(subjects);
    expect(l[0].sections).toEqual([
      { label: 'Section A', indices: [0] },
      { label: 'Section B', indices: [1] },
    ]);
  });
  it('answered + marked is its own state', () => {
    expect(ntaStatus({ selectedOption: 'A', isMarkedForReview: true })).toBe('answered-marked');
    expect(ntaStatus({ selectedOption: '', isMarkedForReview: true })).toBe('marked');
    expect(ntaStatus(undefined)).toBe('not-visited');
  });
});

describe('pickNtaPaper', () => {
  const mk = (subject: string, t: string, n: number) =>
    Array.from({ length: n }, () => ({ subject, question_type: t }));
  it('JEE Main: 20 MCQ + 5 numerical per subject', () => {
    const pool = ['Physics', 'Chemistry', 'Mathematics'].flatMap((s) => [...mk(s, 'single_correct', 30), ...mk(s, 'numerical_int', 10)]);
    const paper = pickNtaPaper(pool, ['Physics', 'Chemistry', 'Mathematics'], 25, 5);
    expect(paper).toHaveLength(75);
    const l = buildNtaLayout(paper);
    l.forEach((s) => expect(s.sections.map((x) => x.indices.length)).toEqual([20, 5]));
  });
  it('fills with MCQs when numericals are short', () => {
    const pool = [...mk('Physics', 'single_correct', 30), ...mk('Physics', 'numerical_int', 2)];
    const l = buildNtaLayout(pickNtaPaper(pool, ['Physics'], 25, 5));
    expect(l[0].sections.map((x) => x.indices.length)).toEqual([23, 2]);
  });
});

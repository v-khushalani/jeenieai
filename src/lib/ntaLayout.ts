/**
 * NTA (CBT) paper layout: subject tabs, Section A (MCQ) then Section B
 * (numerical) inside each subject, plus the 5 official palette states.
 */
import { normalizeSubjectName } from '@/config/examPatterns';

export type NtaStatus = 'not-visited' | 'not-answered' | 'answered' | 'marked' | 'answered-marked';

interface QLike { subject?: string | null; question_type?: string | null }

export const isNumericalType = (t?: string | null) =>
  t === 'numerical_int' || t === 'numerical_decimal' || t === 'numerical';

/** Stable reorder: subject order from the pattern, MCQs before numericals. */
export function orderForNta<T extends QLike>(questions: T[], subjects: string[]): T[] {
  const rank = (q: T) => {
    const s = normalizeSubjectName(q.subject);
    const i = subjects.findIndex((x) => normalizeSubjectName(x) === s);
    return (i < 0 ? subjects.length : i) * 2 + (isNumericalType(q.question_type) ? 1 : 0);
  };
  return questions.map((q, i) => ({ q, i, r: rank(q) }))
    .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.q);
}

export interface NtaSection { label: 'Section A' | 'Section B'; indices: number[] }
export interface NtaSubject { subject: string; sections: NtaSection[] }

/** Group (already ordered) questions by subject → section, keeping global indices. */
export function buildNtaLayout<T extends QLike>(questions: T[]): NtaSubject[] {
  const out: NtaSubject[] = [];
  questions.forEach((q, idx) => {
    const subject = normalizeSubjectName(q.subject) || 'General';
    let s = out.find((x) => x.subject === subject);
    if (!s) { s = { subject, sections: [] }; out.push(s); }
    const label = isNumericalType(q.question_type) ? 'Section B' : 'Section A';
    let sec = s.sections.find((x) => x.label === label);
    if (!sec) { sec = { label, indices: [] }; s.sections.push(sec); }
    sec.indices.push(idx);
  });
  return out;
}

export function ntaStatus(a?: { selectedOption?: string; isMarkedForReview?: boolean }): NtaStatus {
  if (!a) return 'not-visited';
  if (a.isMarkedForReview) return a.selectedOption ? 'answered-marked' : 'marked';
  return a.selectedOption ? 'answered' : 'not-answered';
}

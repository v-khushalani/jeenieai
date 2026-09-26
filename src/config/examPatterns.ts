/**
 * Exam Pattern Configuration
 * 
 * Defines the actual exam patterns for JEE Mains, JEE Advanced, NEET, and MHT-CET
 * including question counts per subject, marking schemes, and duration.
 */

export interface SubjectMarking {
  questionsPerSubject: number;
  correctMarks: number;
  incorrectMarks: number;
  /** MHT-CET has different marks per subject */
}

export interface ExamPattern {
  name: string;
  /** Total duration in minutes */
  duration: number;
  subjects: string[];
  /** Per-subject config */
  subjectConfig: Record<string, SubjectMarking>;
  /** Total questions (computed) */
  totalQuestions: number;
  /** Total marks (computed) */
  totalMarks: number;
}

export const EXAM_PATTERNS: Record<string, ExamPattern> = {
  'JEE Mains': {
    name: 'JEE Mains',
    duration: 180,
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    subjectConfig: {
      Physics: { questionsPerSubject: 25, correctMarks: 4, incorrectMarks: -1 },
      Chemistry: { questionsPerSubject: 25, correctMarks: 4, incorrectMarks: -1 },
      Mathematics: { questionsPerSubject: 25, correctMarks: 4, incorrectMarks: -1 },
    },
    totalQuestions: 75,
    totalMarks: 300,
  },
  'JEE Advanced': {
    name: 'JEE Advanced',
    duration: 180,
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    subjectConfig: {
      Physics: { questionsPerSubject: 25, correctMarks: 4, incorrectMarks: -1 },
      Chemistry: { questionsPerSubject: 25, correctMarks: 4, incorrectMarks: -1 },
      Mathematics: { questionsPerSubject: 25, correctMarks: 4, incorrectMarks: -1 },
    },
    totalQuestions: 75,
    totalMarks: 300,
  },
  NEET: {
    name: 'NEET',
    duration: 200,
    subjects: ['Physics', 'Chemistry', 'Biology'],
    subjectConfig: {
      Physics: { questionsPerSubject: 50, correctMarks: 4, incorrectMarks: -1 },
      Chemistry: { questionsPerSubject: 50, correctMarks: 4, incorrectMarks: -1 },
      Biology: { questionsPerSubject: 100, correctMarks: 4, incorrectMarks: -1 },
    },
    totalQuestions: 200,
    totalMarks: 720, // NEET has 200 Qs but only 180 are mandatory (Section A 35 + Section B 15 per subject). Simplified here.
  },
  'MHT-CET': {
    name: 'MHT-CET',
    duration: 180,
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    subjectConfig: {
      Physics: { questionsPerSubject: 50, correctMarks: 1, incorrectMarks: 0 },
      Chemistry: { questionsPerSubject: 50, correctMarks: 1, incorrectMarks: 0 },
      Mathematics: { questionsPerSubject: 50, correctMarks: 2, incorrectMarks: 0 },
    },
    totalQuestions: 150,
    totalMarks: 200,
  },
};

/**
 * Get exam pattern for a given exam name.
 * Falls back to a generic JEE Mains-like pattern.
 */
export function getExamPattern(examName: string): ExamPattern {
  if (EXAM_PATTERNS[examName]) return EXAM_PATTERNS[examName];
  const upper = (examName || '').toUpperCase();
  if (upper.includes('CET')) return EXAM_PATTERNS['MHT-CET'];
  if (upper.includes('NEET')) return EXAM_PATTERNS['NEET'];
  if (upper.includes('ADVANCED')) return EXAM_PATTERNS['JEE Advanced'];
  return EXAM_PATTERNS['JEE Mains'];
}

/**
 * Resolve the marking scheme for a single subject inside a pattern.
 * CET is subject-dependent (+1 Physics/Chemistry, +2 Maths, no negative),
 * JEE and NEET are uniform (+4 / -1).
 */
export function getSubjectMarking(
  patternName: string | null | undefined,
  subject?: string | null
): { correctMarks: number; incorrectMarks: number } {
  const name = String(patternName || '').toUpperCase();

  // Foundation / custom / chapter tests: plain 1-mark scoring, no penalty.
  if (!name || name.includes('FOUNDATION') || name.includes('CUSTOM')) {
    return { correctMarks: 1, incorrectMarks: 0 };
  }

  const pattern = getExamPattern(String(patternName));
  const canonical = normalizeSubjectName(subject);
  const config = (canonical && pattern.subjectConfig[canonical]) || null;
  if (config) return { correctMarks: config.correctMarks, incorrectMarks: config.incorrectMarks };

  // Unknown subject → use the pattern's most common scheme.
  const first = pattern.subjectConfig[pattern.subjects[0]];
  return { correctMarks: first.correctMarks, incorrectMarks: first.incorrectMarks };
}

function normalizeSubjectName(subject?: string | null): string | null {
  if (!subject) return null;
  const s = subject.trim().toLowerCase();
  if (s.includes('phys')) return 'Physics';
  if (s.includes('chem')) return 'Chemistry';
  if (s.includes('math')) return 'Mathematics';
  if (s.includes('bio') || s.includes('bot') || s.includes('zoo')) return 'Biology';
  return null;
}

export { normalizeSubjectName };

/**
 * Split a total question count equally across the given subjects.
 * Remainder questions are handed out one-by-one from the first subject onward,
 * so a 75/3 split is exactly 25-25-25 and a 50/3 split is 17-17-16.
 */
export function equalSubjectQuotas(subjects: string[], total: number): Record<string, number> {
  const quotas: Record<string, number> = {};
  if (subjects.length === 0 || total <= 0) return quotas;
  const base = Math.floor(total / subjects.length);
  let remainder = total - base * subjects.length;
  for (const subject of subjects) {
    quotas[subject] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return quotas;
}

/**
 * Take an already-fetched mixed pool and build a balanced paper:
 * each subject contributes at most its quota. If one subject is short,
 * the shortfall is redistributed to subjects that still have spare questions,
 * so the paper still reaches the requested size without one subject dominating.
 */
export function balanceQuestionsBySubject<T extends { subject?: string | null }>(
  questions: T[],
  subjects: string[],
  total: number
): T[] {
  if (subjects.length <= 1) return questions.slice(0, total);

  const quotas = equalSubjectQuotas(subjects, total);
  const buckets: Record<string, T[]> = {};
  for (const subject of subjects) buckets[subject] = [];

  for (const question of questions) {
    const canonical = normalizeSubjectName(question.subject);
    const match = subjects.find((s) => normalizeSubjectName(s) === canonical);
    if (match) buckets[match].push(question);
  }

  const picked: T[] = [];
  for (const subject of subjects) {
    picked.push(...buckets[subject].splice(0, quotas[subject]));
  }

  // Redistribute any shortfall so the paper isn't unnecessarily short.
  let shortfall = total - picked.length;
  while (shortfall > 0) {
    const donor = subjects.find((s) => buckets[s].length > 0);
    if (!donor) break;
    picked.push(buckets[donor].shift() as T);
    shortfall -= 1;
  }

  return picked;
}


/**
 * Calculate score based on exam pattern marking scheme
 */
export function calculateExamScore(
  results: Array<{ isCorrect: boolean; selectedOption: string; subject?: string }>,
  pattern: ExamPattern
): { earnedMarks: number; totalMarks: number; subjectWise: Record<string, { earned: number; total: number; correct: number; incorrect: number; skipped: number }> } {
  const subjectWise: Record<string, { earned: number; total: number; correct: number; incorrect: number; skipped: number }> = {};

  // Initialize
  for (const subject of pattern.subjects) {
    const config = pattern.subjectConfig[subject];
    subjectWise[subject] = {
      earned: 0,
      total: config.questionsPerSubject * config.correctMarks,
      correct: 0,
      incorrect: 0,
      skipped: 0,
    };
  }

  let earnedMarks = 0;

  for (const result of results) {
    const subject = result.subject || pattern.subjects[0];
    const config = pattern.subjectConfig[subject] || pattern.subjectConfig[pattern.subjects[0]];
    
    if (!result.selectedOption) {
      if (subjectWise[subject]) subjectWise[subject].skipped++;
      continue;
    }

    if (result.isCorrect) {
      earnedMarks += config.correctMarks;
      if (subjectWise[subject]) {
        subjectWise[subject].earned += config.correctMarks;
        subjectWise[subject].correct++;
      }
    } else {
      earnedMarks += config.incorrectMarks;
      if (subjectWise[subject]) {
        subjectWise[subject].earned += config.incorrectMarks;
        subjectWise[subject].incorrect++;
      }
    }
  }

  return { earnedMarks, totalMarks: pattern.totalMarks, subjectWise };
}

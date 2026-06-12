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
  return EXAM_PATTERNS[examName] || EXAM_PATTERNS['JEE Mains'];
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

/**
 * Centralized Goal & Exam Configuration
 * 
 * TERMINOLOGY:
 * - `target_exam`: The exam/path a student is preparing for: 'JEE' | 'NEET' | 'MH_CET' | 'BOARDS'
 * - `grade`: Class number (6-12)
 * 
 * RULES:
 * - Grades 6-10 → target_exam = 'BOARDS' (Pre-Foundation)
 * - Grades 11-12 → target_exam = 'JEE', 'NEET', or 'MH_CET'
 * - Subjects are derived from target_exam, not stored separately
 */

export type TargetExam = 'JEE' | 'NEET' | 'MH_CET' | 'BOARDS';

export const VALID_EXAMS: TargetExam[] = ['JEE', 'NEET', 'MH_CET', 'BOARDS'];

export const GRADE_RANGE = { min: 6, max: 12 } as const;

/** Grades that only support Pre-Foundation (no competitive exam) */
export const FOUNDATION_GRADES = [6, 7, 8, 9, 10] as const;

/** Grades that support competitive exams (JEE/NEET/MH-CET) */
export const COMPETITIVE_GRADES = [11, 12] as const;

/** Subjects per exam type */
export const EXAM_SUBJECTS: Record<TargetExam, string[]> = {
  JEE: ['Physics', 'Chemistry', 'Mathematics'],
  NEET: ['Physics', 'Chemistry', 'Biology'],
  MH_CET: ['Physics', 'Chemistry', 'Mathematics'],
  BOARDS: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
};

/** Human-readable labels */
export const EXAM_LABELS: Record<TargetExam, string> = {
  JEE: 'JEE Preparation',
  NEET: 'NEET Preparation',
  MH_CET: 'MHT-CET Preparation',
  BOARDS: 'Pre-Foundation',
};

/** Short labels */
export const EXAM_SHORT_LABELS: Record<TargetExam, string> = {
  JEE: 'JEE',
  NEET: 'NEET',
  MH_CET: 'MHT-CET',
  BOARDS: 'Pre-Foundation',
};

// ─── Helpers ──────────────────────────────────────────────

/** Check if a grade supports competitive exams */
export const isCompetitiveGrade = (grade: number): boolean =>
  grade >= 11 && grade <= 12;

/** Check if a grade is foundation-level */
export const isFoundationGrade = (grade: number): boolean =>
  grade >= 6 && grade <= 10;

/** Get allowed exams for a given grade */
export const getAllowedExams = (grade: number): TargetExam[] =>
  isCompetitiveGrade(grade) ? ['JEE', 'NEET', 'MH_CET'] : ['BOARDS'];

/** Get subjects for a given exam */
export const getSubjects = (exam: TargetExam): string[] =>
  EXAM_SUBJECTS[exam] || EXAM_SUBJECTS.BOARDS;

/**
 * Convert legacy values to standardized TargetExam.
 */
export const normalizeTargetExam = (value: string | null | undefined): TargetExam => {
  if (!value) return 'BOARDS';
  const upper = value.toUpperCase().trim();
  if (upper.includes('JEE') || upper.includes('PCM')) return 'JEE';
  if (upper.includes('NEET') || upper.includes('PCB')) return 'NEET';
  if (upper.includes('MH_CET') || upper.includes('MH-CET') || upper.includes('MHCET') || upper.includes('MHT-CET') || upper === 'CET') return 'MH_CET';
  if (upper.startsWith('FOUNDATION')) return 'BOARDS';
  if (upper === 'CLASS' || upper === 'BOARDS') return 'BOARDS';
  return 'BOARDS';
};

/**
 * Derive the batch exam_type for DB queries.
 * Maps our clean TargetExam → the legacy batch.exam_type values
 * stored in the batches table.
 */
export const toBatchExamType = (exam: TargetExam, grade: number): string => {
  if (exam === 'BOARDS') return 'Foundation';
  return exam; // 'JEE', 'NEET', or 'MH_CET'
};

/**
 * Convert selected exam to DB-compatible target_exam value.
 * Foundation grades use grade-qualified values for compatibility with existing flows.
 */
export const toDbTargetExam = (exam: TargetExam, grade: number): string => {
  if (exam === 'BOARDS') {
    return isFoundationGrade(grade) ? `Foundation-${grade}` : 'Foundation';
  }
  return exam;
};

/**
 * Check if a profile has completed goal selection.
 */
export const isGoalComplete = (profile: {
  target_exam?: string | null;
  grade?: number | null;
}): boolean => {
  return !!(profile.target_exam && profile.grade);
};

/**
 * Build the profile update payload for goal selection.
 */
export const buildGoalPayload = (exam: TargetExam, grade: number) => ({
  target_exam: toDbTargetExam(exam, grade),
  grade,
  goal_locked: true,
  goal_locked_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

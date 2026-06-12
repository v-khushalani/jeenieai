/**
 * SINGLE SOURCE OF TRUTH for exam-name mappings between
 * batch examType (UI/legacy) and actual `questions.exam` values in DB.
 *
 * Post-cleanup (Jun 2026): DB now holds ONLY:
 *   - 'JEE Main', 'JEE Advanced' (+ legacy aliases 'JEE Mains', 'JEE')
 *   - 'NEET'
 *   - 'Foundation', 'Scholarship'
 *
 * All other exams (BITSAT, WBJEE, CETs, NDA, AIIMS, JIPMER, KVPY,
 * VITEEE, COMEDK, NULL) were permanently deleted per user instruction.
 */

export const DB_EXAM_VALUES = {
  NEET: 'NEET',
  JEE_MAIN: 'JEE Main',
  JEE_MAINS_ALT: 'JEE Mains',
  JEE_ADVANCED: 'JEE Advanced',
  JEE_GENERIC: 'JEE',
  FOUNDATION: 'Foundation',
  SCHOLARSHIP: 'Scholarship',
} as const;

/**
 * Maps a batch examType to the list of DB `exam` values to match.
 */
export function getDbExamValuesForBatch(examType: string): string[] {
  const n = (examType || '').trim().toUpperCase();

  if (n.startsWith('FOUNDATION')) return [DB_EXAM_VALUES.FOUNDATION];
  if (n === 'SCHOLARSHIP') return [DB_EXAM_VALUES.SCHOLARSHIP];

  if (n === 'JEE' || n === 'JEE MAIN' || n === 'JEE MAINS' || n === 'JEE ADVANCED') {
    return [
      DB_EXAM_VALUES.JEE_GENERIC,
      DB_EXAM_VALUES.JEE_MAIN,
      DB_EXAM_VALUES.JEE_MAINS_ALT,
      DB_EXAM_VALUES.JEE_ADVANCED,
    ];
  }

  if (n === 'NEET') {
    return [DB_EXAM_VALUES.NEET];
  }

  // Unknown batch — return verbatim
  return [examType];
}

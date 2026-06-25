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
  // Normalize: trim, uppercase, and convert underscores/hyphens to spaces
  // so that 'JEE_MAINS', 'jee-main', 'JEE Mains' all collapse to the same key.
  const n = (examType || '').trim().toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

  if (n.startsWith('FOUNDATION')) return [DB_EXAM_VALUES.FOUNDATION];
  if (n === 'SCHOLARSHIP') return [DB_EXAM_VALUES.SCHOLARSHIP];

  if (
    n === 'JEE' ||
    n === 'JEE MAIN' ||
    n === 'JEE MAINS' ||
    n === 'JEE ADVANCED' ||
    n === 'JEE ADV' ||
    n === 'IIT JEE' ||
    n === 'PCM'
  ) {
    return [
      DB_EXAM_VALUES.JEE_GENERIC,
      DB_EXAM_VALUES.JEE_MAIN,
      DB_EXAM_VALUES.JEE_MAINS_ALT,
      DB_EXAM_VALUES.JEE_ADVANCED,
    ];
  }

  if (n === 'NEET' || n === 'NEET UG' || n === 'PCB') {
    return [DB_EXAM_VALUES.NEET];
  }

  // Unknown batch — return verbatim (preserves original for unmapped exam types)
  return [examType];
}


/**
 * Utility functions for consistent grade parsing and handling
 * Ensures grades are always treated as numbers, regardless of storage format
 */

import { logger } from './logger';

/**
 * Parse grade from various formats to numeric value
 * Handles: "9", "9th", 9, null, undefined, etc.
 * @param grade - Grade value in any format
 * @param defaultGrade - Default value if parsing fails (default: 12)
 * @returns Numeric grade (6-13)
 */
export const parseGrade = (grade: any, defaultGrade: number = 12): number => {
  if (grade === null || grade === undefined) {
    return defaultGrade;
  }

  // Already a number
  if (typeof grade === 'number') {
    return grade;
  }

  // String format
  if (typeof grade === 'string') {
    // Remove "th", "st", "nd", "rd" suffixes
    const cleaned = grade.replace(/th|st|nd|rd/i, '').trim();
    
    // Special cases
    if (cleaned === '12-pass') return 13;
    
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 13) {
      return parsed;
    }
  }

  logger.warn('Failed to parse grade', { grade, defaultGrade });
  return defaultGrade;
};

/**
 * Format grade to display string (e.g., 9 -> "9th", 12 -> "12th")
 * @param grade - Numeric grade
 * @returns Formatted grade string
 */
export const formatGradeDisplay = (grade: any): string => {
  const numGrade = parseGrade(grade);

  if (numGrade === 13) return '12th-pass';
  if (numGrade === 11) return '11th';
  if (numGrade === 12) return '12th';
  
  return `${numGrade}th`;
};

/**
 * Check if grade is in Foundation range (6-10)
 * @param grade - Grade to check
 * @returns true if grade is 6-10
 */
export const isFoundationGrade = (grade: any): boolean => {
  const numGrade = parseGrade(grade);
  return numGrade >= 6 && numGrade <= 10;
};

/**
 * Check if grade is in Higher Education range (11-12)
 * @param grade - Grade to check
 * @returns true if grade is 11 or 12
 */
export const isHigherEducationGrade = (grade: any): boolean => {
  const numGrade = parseGrade(grade);
  return numGrade === 11 || numGrade === 12;
};

/**
 * Extract grade from exam type string
 * E.g., "Foundation-9" -> 9, "JEE" -> 12
 * @param examType - Exam type string
 * @returns Numeric grade
 */
export const extractGradeFromExamType = (examType: any): number => {
  if (!examType || typeof examType !== 'string') {
    return 12; // Default to 12th
  }

  // For Foundation-X format
  if (examType.startsWith('Foundation-')) {
    const gradeStr = examType.split('-')[1];
    const grade = parseInt(gradeStr, 10);
    if (!isNaN(grade) && grade >= 6 && grade <= 10) {
      return grade;
    }
  }

  // For JEE/NEET (higher education)
  if (examType === 'JEE' || examType === 'JEE Main' || examType === 'JEE Advanced' || examType === 'NEET') {
    return 12; // These are for 11th-12th grades
  }

  return 12; // Default
};

/**
 * Get target exam from grade and exam base type
 * E.g., grade=9, examType="Foundation" -> "Foundation-9"
 * @param grade - Student grade
 * @param examType - Base exam type (Foundation, JEE, NEET, etc.)
 * @returns Full target exam string
 */
export const getTargetExamFromGrade = (grade: any, examType: string): string => {
  const numGrade = parseGrade(grade);
  
  if (examType === 'Foundation' && numGrade >= 6 && numGrade <= 10) {
    return `Foundation-${numGrade}`;
  }

  // Higher education exams don't have grade suffix
  return examType;
};

/**
 * Validate if grade and exam type are compatible
 * @param grade - Student grade
 * @param examType - Exam type
 * @returns true if compatible
 */
export const areGradeAndExamCompatible = (grade: any, examType: string): boolean => {
  const numGrade = parseGrade(grade);

  // Foundation exams: grades 6-10
  if (examType && examType.startsWith('Foundation')) {
    return numGrade >= 6 && numGrade <= 10;
  }

  // Higher education exams: grades 11-12
  if (examType === 'JEE' || examType === 'NEET') {
    return numGrade === 11 || numGrade === 12;
  }

  return true; // Default allow
};

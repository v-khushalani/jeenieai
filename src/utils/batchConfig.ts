/**
 * BATCH CONFIGURATION - CLEAN ARCHITECTURE
 * Grade 6-10: Foundation courses (1 per grade)
 * Grade 11-12: JEE/NEET exam courses
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import { parseGrade, isFoundationGrade, extractGradeFromExamType } from './gradeParser';
import { normalizeProgram, PROGRAM_SUBJECTS } from '@/utils/programConfig';

export interface BatchInfo {
  id: string;
  name: string;
  slug: string;
  grade: number;
  exam_type: string;
  subjects: string[];
}

const FOUNDATION_SUBJECTS = PROGRAM_SUBJECTS['Class'];
const JEE_SUBJECTS = PROGRAM_SUBJECTS['JEE'];
const NEET_SUBJECTS = PROGRAM_SUBJECTS['NEET'];

export const getSubjectsForExam = (examType: string): string[] => {
  const prog = normalizeProgram(examType);
  return PROGRAM_SUBJECTS[prog] || FOUNDATION_SUBJECTS;
};

export const getAllowedSubjects = (targetExam: string): string[] => {
  return getSubjectsForExam(targetExam);
};

export const getBatchForStudent = async (
  userId: string,
  grade: number,
  targetExam: string
): Promise<BatchInfo | null> => {
  try {
    const parsedGrade = parseGrade(grade);

    if (isFoundationGrade(parsedGrade)) {
      // Foundation: Find batch for this specific grade
      const { data: batch, error } = await supabase
        .from('batches')
        .select('id, name, slug, grade, exam_type, batch_subjects(subject)')
        .eq('grade', parsedGrade)
        .eq('exam_type', 'Foundation')
        .eq('is_active', true)
        .single();

      if (error || !batch) return null;

      return {
        id: batch.id,
        name: batch.name,
        slug: batch.slug,
        grade: batch.grade,
        exam_type: 'Foundation',
        subjects: batch.batch_subjects?.map((bs: any) => bs.subject) || []
      };
    }

    // JEE/NEET: Find batch for exam type
    const examType = normalizeProgram(targetExam) === 'NEET' ? 'NEET' : 'JEE';
    const { data: batch, error } = await supabase
      .from('batches')
      .select('id, name, slug, grade, exam_type, batch_subjects(subject)')
      .eq('exam_type', examType)
      .eq('grade', parsedGrade)
      .eq('is_active', true)
      .single();

    if (error || !batch) return null;

    return {
      id: batch.id,
      name: batch.name,
      slug: batch.slug,
      grade: batch.grade,
      exam_type: batch.exam_type,
      subjects: batch.batch_subjects?.map((bs: any) => bs.subject) || []
    };
  } catch (error) {
    logger.error('Error getting batch for student:', error);
    return null;
  }
};

export const getBatchSubjectsFromDB = async (batchId: string): Promise<string[]> => {
  const { data: subjects, error } = await supabase
    .from('batch_subjects')
    .select('subject')
    .eq('batch_id', batchId)
    .order('display_order', { ascending: true });

  return (!error && subjects) ? subjects.map(s => s.subject) : [];
};

export const getFilteredSubjects = (targetExam: string, batchSubjects: string[]): string[] => {
  const allowed = getAllowedSubjects(targetExam);
  return batchSubjects.filter(s => allowed.includes(s));
};

export const isSubjectAllowed = (targetExam: string, subject: string, batchSubjects: string[]): boolean => {
  const allowed = getAllowedSubjects(targetExam);
  return allowed.includes(subject) && batchSubjects.includes(subject);
};

export const getBatchDependencies = (profile: any): (string | number | undefined)[] => [
  profile?.grade,
  profile?.target_exam,
  profile?.batch_id
];

export const getExamTypeForGrade = (grade: number, targetExam?: string): string => {
  const parsedGrade = parseGrade(grade);
  if (isFoundationGrade(parsedGrade)) return 'Foundation';
  return targetExam?.includes('NEET') ? 'NEET' : 'JEE';
};

export const logBatchConfig = (stage: string, userId: string, grade: number, targetExam: string, batch?: BatchInfo | null) => {
  logger.info(`[${stage}]`, { grade: parseGrade(grade), exam: targetExam, batch: batch?.name });
};

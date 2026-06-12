/**
 * Batches API Module
 * 
 * Handles all batch-related API operations
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import type { Batch, BatchWithSubjects, PaginatedResponse, ApiResponse } from '../types';

export interface BatchFilters {
  grade?: number;
  exam_type?: string;
  is_active?: boolean;
}

export const batchesAPI = {
  /**
   * Get paginated batches
   */
  async getBatches(
    page = 1,
    pageSize = 50,
    filters: BatchFilters = {}
  ): Promise<PaginatedResponse<Batch>> {
    return apiClient.fetchPaginated('batches', {
      page,
      pageSize,
      filters: { ...filters, is_active: filters.is_active ?? true },
      orderBy: 'grade',
      orderDirection: 'asc',
      cacheTTL: CACHE_TTL.LONG,
      cacheTags: [CACHE_TAGS.BATCHES],
    }) as Promise<PaginatedResponse<Batch>>;
  },

  /**
   * Get batch by grade and exam type
   */
  async getByGradeAndExam(
    grade: number,
    examType: string
  ): Promise<ApiResponse<BatchWithSubjects | null>> {
    const cacheKey = `batch:${grade}:${examType}`;
    const cached = cache.get<BatchWithSubjects>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      // Normalize exam type
      let normalizedExamType = examType;
      if (examType.startsWith('Foundation')) {
        normalizedExamType = 'Foundation';
      }

      const { data: batch, error } = await apiClient.rawClient
        .from('batches')
        .select('*')
        .eq('grade', grade)
        .eq('exam_type', normalizedExamType)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No batch found
          return { data: null, error: null };
        }
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Get subjects for this batch
      const { data: subjectsData } = await apiClient.rawClient
        .from('batch_subjects')
        .select('subject')
        .eq('batch_id', batch.id);

      const subjects = subjectsData?.map(s => s.subject) || [];

      const batchWithSubjects: BatchWithSubjects = {
        ...(batch as Batch),
        subjects,
      };

      cache.set(cacheKey, batchWithSubjects, CACHE_TTL.LONG, [CACHE_TAGS.BATCHES]);

      return { data: batchWithSubjects, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get a single batch by ID with subjects
   */
  async getById(id: string): Promise<ApiResponse<BatchWithSubjects>> {
    const cacheKey = `batch:id:${id}`;
    const cached = cache.get<BatchWithSubjects>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data: batch, error } = await apiClient.rawClient
        .from('batches')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Get subjects
      const { data: subjectsData } = await apiClient.rawClient
        .from('batch_subjects')
        .select('subject')
        .eq('batch_id', id);

      const subjects = subjectsData?.map(s => s.subject) || [];

      const batchWithSubjects: BatchWithSubjects = {
        ...(batch as Batch),
        subjects,
      };

      cache.set(cacheKey, batchWithSubjects, CACHE_TTL.LONG, [CACHE_TAGS.BATCHES]);

      return { data: batchWithSubjects, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get all active batches with subjects
   */
  async getAllActive(): Promise<ApiResponse<BatchWithSubjects[]>> {
    const cacheKey = 'batches:all-active';
    const cached = cache.get<BatchWithSubjects[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data: batches, error } = await apiClient.rawClient
        .from('batches')
        .select('*')
        .eq('is_active', true)
        .order('grade', { ascending: true });

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Get subjects for all batches
      const batchIds = (batches || []).map(b => b.id);
      const { data: subjectsData } = await apiClient.rawClient
        .from('batch_subjects')
        .select('batch_id, subject')
        .in('batch_id', batchIds);

      // Map subjects to batches
      const subjectsByBatch = new Map<string, string[]>();
      (subjectsData || []).forEach(s => {
        const existing = subjectsByBatch.get(s.batch_id) || [];
        existing.push(s.subject);
        subjectsByBatch.set(s.batch_id, existing);
      });

      const batchesWithSubjects: BatchWithSubjects[] = (batches || []).map(batch => ({
        ...(batch as Batch),
        subjects: subjectsByBatch.get(batch.id) || [],
      }));

      cache.set(cacheKey, batchesWithSubjects, CACHE_TTL.LONG, [CACHE_TAGS.BATCHES]);

      return { data: batchesWithSubjects, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Create or ensure batch exists (for admin)
   */
  async ensureBatch(
    grade: number,
    examType: string,
    subjects: string[]
  ): Promise<ApiResponse<BatchWithSubjects>> {
    // Check if batch exists
    const existing = await this.getByGradeAndExam(grade, examType);
    if (existing.data) {
      return existing as ApiResponse<BatchWithSubjects>;
    }

    try {
      // Create batch
      const { data: batch, error } = await apiClient.rawClient
        .from('batches')
        .insert({
          name: `${examType} Grade ${grade}`,
          grade,
          exam_type: examType,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Create batch subjects
      if (subjects.length > 0) {
        await apiClient.rawClient
          .from('batch_subjects')
          .insert(
            subjects.map(subject => ({
              batch_id: batch.id,
              subject,
            }))
          );
      }

      // Invalidate cache
      cache.invalidateByTag(CACHE_TAGS.BATCHES);

      return {
        data: {
          ...(batch as Batch),
          subjects,
        },
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Invalidate batches cache
   */
  invalidateCache(): void {
    cache.invalidateByTag(CACHE_TAGS.BATCHES);
  },
};

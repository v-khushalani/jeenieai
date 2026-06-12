/**
 * Chapters API Module
 * 
 * Handles all chapter-related API operations
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import type { Chapter, PaginatedResponse, ApiResponse } from '../types';
import { getSubjectAliases } from '@/lib/subjectNormalization';

export interface ChapterFilters {
  batch_id?: string;
  subject?: string;
  is_active?: boolean;
}

export const chaptersAPI = {
  /**
   * Get paginated chapters
   */
  async getChapters(
    page = 1,
    pageSize = 50,
    filters: ChapterFilters = {}
  ): Promise<PaginatedResponse<Chapter>> {
    return apiClient.fetchPaginated('chapters', {
      page,
      pageSize,
      filters: filters as Record<string, unknown>,
      orderBy: 'chapter_number',
      orderDirection: 'asc',
      cacheTTL: CACHE_TTL.LONG,
      cacheTags: [CACHE_TAGS.CHAPTERS],
    }) as unknown as Promise<PaginatedResponse<Chapter>>;
  },

  /**
   * Get all chapters for a batch (with caching).
   * Looks up by batch_id, but also includes chapters that have no batch_id yet
   * but whose `exam_relevance` overlaps the batch's exam (so freshly imported
   * chapters appear immediately).
   */
  async getByBatch(batchId: string, subject?: string): Promise<ApiResponse<Chapter[]>> {
    const cacheKey = `chapters:batch:${batchId}:${subject || 'all'}`;
    const cached = cache.get<Chapter[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      // Discover the batch's exam type so we can also include orphan chapters
      const { data: batch } = await apiClient.rawClient
        .from('batches')
        .select('exam_type')
        .eq('id', batchId)
        .maybeSingle();

      const examType = (batch as { exam_type?: string } | null)?.exam_type ?? '';
      const examTags = examType === 'JEE' ? ['JEE_MAINS', 'JEE_ADVANCED']
        : examType === 'NEET' ? ['NEET']
        : examType.startsWith('Foundation') ? ['FOUNDATION']
        : [];

      const filterClause = examTags.length
        ? `batch_id.eq.${batchId},and(batch_id.is.null,exam_relevance.ov.{${examTags.join(',')}})`
        : `batch_id.eq.${batchId}`;

      let query = apiClient.rawClient
        .from('chapters')
        .select('*')
        .or(filterClause)
        .eq('is_active', true)
        .order('chapter_number', { ascending: true });

      if (subject) {
        query = query.in('subject', getSubjectAliases(subject));
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      cache.set(cacheKey, data || [], CACHE_TTL.LONG, [CACHE_TAGS.CHAPTERS]);

      return { data: (data || []) as Chapter[], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get a single chapter by ID
   */
  async getById(id: string): Promise<ApiResponse<Chapter>> {
    return apiClient.fetchById('chapters', id, {
      cacheTTL: CACHE_TTL.LONG,
    }) as Promise<ApiResponse<Chapter>>;
  },

  /**
   * Get chapter with topics count
   */
  async getWithTopicsCount(batchId: string, subject: string): Promise<ApiResponse<(Chapter & { topics_count: number })[]>> {
    const cacheKey = `chapters:with-topics:${batchId}:${subject}`;
    const cached = cache.get<(Chapter & { topics_count: number })[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data, error } = await apiClient.rawClient
        .from('chapters')
        .select(`
          *,
          topics:topics(count)
        `)
        .eq('batch_id', batchId)
        .in('subject', getSubjectAliases(subject))
        .eq('is_active', true)
        .order('chapter_number', { ascending: true });

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      const chaptersWithCount = (data || []).map(chapter => ({
        ...(chapter as unknown as Chapter),
        topics_count: (chapter as { topics: { count: number }[] }).topics?.[0]?.count || 0,
      }));

      cache.set(cacheKey, chaptersWithCount, CACHE_TTL.LONG, [CACHE_TAGS.CHAPTERS]);

      return { data: chaptersWithCount, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Invalidate chapters cache
   */
  invalidateCache(): void {
    cache.invalidateByTag(CACHE_TAGS.CHAPTERS);
  },
};

/**
 * Questions API Module
 * 
 * Handles all question-related API operations with:
 * - Pagination
 * - Caching
 * - Filter support
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import type { Question, PaginatedResponse, ApiResponse, FilterOptions } from '../types';

export interface QuestionFilters extends FilterOptions {
  topic_id?: string;
  chapter_id?: string;
  subject?: string;
  difficulty?: string;
}

export const questionsAPI = {
  /**
   * Get paginated questions with filters
   */
  async getQuestions(
    page = 1,
    pageSize = 50,
    filters: QuestionFilters = {}
  ): Promise<PaginatedResponse<Question>> {
    return apiClient.fetchPaginated('questions_public' as any, {
      page,
      pageSize,
      filters: filters as Record<string, unknown>,
      orderBy: 'created_at',
      orderDirection: 'desc',
      cacheTTL: CACHE_TTL.MEDIUM,
      cacheTags: [CACHE_TAGS.QUESTIONS],
    }) as unknown as Promise<PaginatedResponse<Question>>;
  },

  /**
   * Get questions by topic ID
   */
  async getByTopic(
    topicId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<Question>> {
    return this.getQuestions(page, pageSize, { topic_id: topicId });
  },

  /**
   * Get questions by chapter ID
   */
  async getByChapter(
    chapterId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<Question>> {
    return this.getQuestions(page, pageSize, { chapter_id: chapterId });
  },

  /**
   * Get questions by subject
   */
  async getBySubject(
    subject: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<Question>> {
    return this.getQuestions(page, pageSize, { subject });
  },

  /**
   * Get a single question by ID
   */
  async getById(id: string): Promise<ApiResponse<Question>> {
    return apiClient.fetchById('questions_public' as any, id, {
      cacheTTL: CACHE_TTL.LONG,
    }) as unknown as Promise<ApiResponse<Question>>;
  },

  /**
   * Get multiple questions by IDs (for tests)
   */
  async getByIds(ids: string[]): Promise<ApiResponse<Question[]>> {
    return apiClient.fetchByIds('questions_public' as any, ids, {
      cacheTTL: CACHE_TTL.LONG,
    }) as unknown as Promise<ApiResponse<Question[]>>;
  },

  /**
   * Get random questions for practice/test
   */
  async getRandom(
    count: number,
    filters: QuestionFilters = {}
  ): Promise<ApiResponse<Question[]>> {
    // Check cache first
    const cacheKey = `questions:random:${count}:${JSON.stringify(filters)}`;
    const cached = cache.get<Question[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      // Build query with random ordering
      let query = apiClient.rawClient
        .from('questions_public' as any)
        .select('*')
        .or('is_active.is.null,is_active.eq.true');

      // Apply filters
      if (filters.topic_id) query = query.eq('topic_id', filters.topic_id);
      if (filters.chapter_id) query = query.eq('chapter_id', filters.chapter_id);
      if (filters.subject) query = query.eq('subject', filters.subject);
      if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);

      // Random order and limit
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(count * 3); // Get more to randomize from

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Shuffle and take required count
      const shuffled = ((data || []) as unknown as Question[])
        .sort(() => Math.random() - 0.5)
        .slice(0, count);

      // Cache for short time (randomness should vary)
      cache.set(cacheKey, shuffled, CACHE_TTL.SHORT, [CACHE_TAGS.QUESTIONS]);

      return { data: shuffled, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get question count by filters
   */
  async getCount(filters: QuestionFilters = {}): Promise<ApiResponse<number>> {
    const cacheKey = `questions:count:${JSON.stringify(filters)}`;
    const cached = cache.get<number>(cacheKey);
    if (cached !== null) {
      return { data: cached, error: null };
    }

    try {
      let query = apiClient.rawClient
        .from('questions_public' as any)
        .select('id', { count: 'exact', head: true })
        .or('is_active.is.null,is_active.eq.true');

      if (filters.topic_id) query = query.eq('topic_id', filters.topic_id);
      if (filters.chapter_id) query = query.eq('chapter_id', filters.chapter_id);
      if (filters.subject) query = query.eq('subject', filters.subject);
      if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);

      const { count, error } = await query;

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      cache.set(cacheKey, count || 0, CACHE_TTL.MEDIUM, [CACHE_TAGS.QUESTIONS]);

      return { data: count || 0, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Invalidate questions cache
   */
  invalidateCache(): void {
    cache.invalidateByTag(CACHE_TAGS.QUESTIONS);
  },
};

/**
 * Topics API Module
 * 
 * Handles all topic-related API operations
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import type { Topic, PaginatedResponse, ApiResponse } from '../types';

export interface TopicFilters {
  chapter_id?: string;
  difficulty_level?: string;
}

export const topicsAPI = {
  /**
   * Get paginated topics
   */
  async getTopics(
    page = 1,
    pageSize = 50,
    filters: TopicFilters = {}
  ): Promise<PaginatedResponse<Topic>> {
    return apiClient.fetchPaginated('topics', {
      page,
      pageSize,
      filters: filters as Record<string, unknown>,
      orderBy: 'topic_number',
      orderDirection: 'asc',
      cacheTTL: CACHE_TTL.LONG,
      cacheTags: [CACHE_TAGS.TOPICS],
    }) as unknown as Promise<PaginatedResponse<Topic>>;
  },

  /**
   * Get all topics for a chapter
   */
  async getByChapter(chapterId: string): Promise<ApiResponse<Topic[]>> {
    const cacheKey = `topics:chapter:${chapterId}`;
    const cached = cache.get<Topic[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data, error } = await apiClient.rawClient
        .from('topics')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('topic_number', { ascending: true });

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      cache.set(cacheKey, data || [], CACHE_TTL.LONG, [CACHE_TAGS.TOPICS]);

      return { data: ((data || []) as unknown as Topic[]), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get a single topic by ID
   */
  async getById(id: string): Promise<ApiResponse<Topic>> {
    return apiClient.fetchById('topics', id, {
      cacheTTL: CACHE_TTL.LONG,
    }) as unknown as Promise<ApiResponse<Topic>>;
  },

  /**
   * Get topic with questions count
   */
  async getWithQuestionsCount(chapterId: string): Promise<ApiResponse<(Topic & { questions_count: number })[]>> {
    const cacheKey = `topics:with-questions:${chapterId}`;
    const cached = cache.get<(Topic & { questions_count: number })[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data, error } = await apiClient.rawClient
        .from('topics')
        .select(`
          *,
          questions:questions!topic_id(count)
        `)
        .eq('chapter_id', chapterId)
        .order('topic_number', { ascending: true });

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      const topicsWithCount = (data || []).map(topic => ({
        ...(topic as unknown as Topic),
        questions_count: (topic as unknown as { questions: { count: number }[] }).questions?.[0]?.count || 0,
      }));

      cache.set(cacheKey, topicsWithCount, CACHE_TTL.LONG, [CACHE_TAGS.TOPICS]);

      return { data: topicsWithCount, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Invalidate topics cache
   */
  invalidateCache(): void {
    cache.invalidateByTag(CACHE_TAGS.TOPICS);
  },
};

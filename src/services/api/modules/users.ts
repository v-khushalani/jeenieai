/**
 * Users API Module
 * 
 * Handles all user-related API operations
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import type { UserProfile, TopicMastery, QuestionAttempt, LeaderboardEntry, ApiResponse, PaginatedResponse } from '../types';

export const usersAPI = {
  /**
   * Get current user profile
   */
  async getCurrentProfile(): Promise<ApiResponse<UserProfile>> {
    const { data: { user } } = await apiClient.rawClient.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated', code: 'UNAUTHENTICATED' } };
    }
    return this.getProfile(user.id);
  },

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string): Promise<ApiResponse<UserProfile>> {
    const cacheKey = `user:profile:${userId}`;
    const cached = cache.get<UserProfile>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data, error } = await apiClient.rawClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      cache.set(cacheKey, data, CACHE_TTL.MEDIUM, [CACHE_TAGS.USER]);

      return { data: data as unknown as UserProfile, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<ApiResponse<UserProfile>> {
    try {
      const { data, error } = await apiClient.rawClient
        .from('profiles')
        .update(updates as any)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Invalidate cache
      cache.delete(`user:profile:${userId}`);
      cache.invalidateByTag(CACHE_TAGS.USER);

      return { data: data as unknown as UserProfile, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get user's topic mastery
   */
  async getTopicMastery(userId: string): Promise<ApiResponse<TopicMastery[]>> {
    const cacheKey = `user:mastery:${userId}`;
    const cached = cache.get<TopicMastery[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data, error } = await apiClient.rawClient
        .from('topic_mastery')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      cache.set(cacheKey, data || [], CACHE_TTL.SHORT, [CACHE_TAGS.USER]);

      return { data: (data || []) as TopicMastery[], error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get user's question attempts (paginated)
   */
  async getQuestionAttempts(
    userId: string,
    page = 1,
    pageSize = 50
  ): Promise<PaginatedResponse<QuestionAttempt>> {
    return apiClient.fetchPaginated('question_attempts', {
      page,
      pageSize,
      filters: { user_id: userId },
      orderBy: 'attempted_at',
      orderDirection: 'desc',
      cacheTTL: CACHE_TTL.SHORT,
      cacheTags: [CACHE_TAGS.USER],
    }) as Promise<PaginatedResponse<QuestionAttempt>>;
  },

  /**
   * Record a question attempt
   */
  async recordAttempt(
    attempt: Omit<QuestionAttempt, 'id' | 'attempted_at'>
  ): Promise<ApiResponse<QuestionAttempt>> {
    try {
      const { data, error } = await apiClient.rawClient
        .from('question_attempts')
        .insert(attempt)
        .select()
        .single();

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Invalidate user cache
      cache.invalidateByPattern(`user:.*:${attempt.user_id}`);

      return { data: data as QuestionAttempt, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    limit = 50,
    timeframe: 'all' | 'weekly' | 'monthly' = 'all'
  ): Promise<ApiResponse<LeaderboardEntry[]>> {
    const cacheKey = `leaderboard:${timeframe}:${limit}`;
    const cached = cache.get<LeaderboardEntry[]>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      // For now, use all-time leaderboard
      // TODO: Add time-filtered views in database
      const { data, error } = await apiClient.rawClient
        .from('profiles')
        .select('id, full_name, avatar_url, total_points, current_streak')
        .order('total_points', { ascending: false })
        .limit(limit);

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      const leaderboard: LeaderboardEntry[] = (data || []).map((user, index) => ({
        rank: index + 1,
        user_id: user.id,
        full_name: user.full_name || 'Anonymous',
        avatar_url: user.avatar_url,
        total_points: user.total_points || 0,
        current_streak: user.current_streak || 0,
      }));

      cache.set(cacheKey, leaderboard, CACHE_TTL.MEDIUM, [CACHE_TAGS.USER]);

      return { data: leaderboard, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get user stats summary
   */
  async getStats(userId: string): Promise<ApiResponse<{
    totalQuestions: number;
    correctAnswers: number;
    accuracy: number;
    totalPoints: number;
    currentStreak: number;
    longestStreak: number;
    topicsCompleted: number;
  }>> {
    const cacheKey = `user:stats:${userId}`;
    const cached = cache.get<{
      totalQuestions: number;
      correctAnswers: number;
      accuracy: number;
      totalPoints: number;
      currentStreak: number;
      longestStreak: number;
      topicsCompleted: number;
    }>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      // Get profile
      const { data: profile } = await apiClient.rawClient
        .from('profiles')
        .select('total_points, current_streak, longest_streak')
        .eq('id', userId)
        .single();

      // Get attempt stats
      const { data: attempts } = await apiClient.rawClient
        .from('question_attempts')
        .select('is_correct')
        .eq('user_id', userId);

      // Get mastery stats
      const { data: mastery } = await apiClient.rawClient
        .from('topic_mastery')
        .select('mastery_level')
        .eq('user_id', userId)
        .gte('mastery_level', 80); // Topics with 80%+ mastery

      const totalQuestions = attempts?.length || 0;
      const correctAnswers = attempts?.filter(a => a.is_correct).length || 0;

      const stats = {
        totalQuestions,
        correctAnswers,
        accuracy: totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0,
        totalPoints: profile?.total_points || 0,
        currentStreak: profile?.current_streak || 0,
        longestStreak: profile?.longest_streak || 0,
        topicsCompleted: mastery?.length || 0,
      };

      cache.set(cacheKey, stats, CACHE_TTL.SHORT, [CACHE_TAGS.USER]);

      return { data: stats, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get user's weakness areas
   */
  async getWeaknessAreas(
    userId: string,
    limit = 5
  ): Promise<ApiResponse<Array<{
    topic: string;
    subject: string;
    weakness_score: number;
    accuracy_percentage: number;
  }>>> {
    const cacheKey = `user:weakness:${userId}:${limit}`;
    const cached = cache.get<Array<{
      topic: string;
      subject: string;
      weakness_score: number;
      accuracy_percentage: number;
    }>>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      // Derive weak topics from topic_mastery (weakness_analysis table removed)
      const { data, error } = await apiClient.rawClient
        .from('topic_mastery')
        .select('topic_id, mastery_level, accuracy, questions_attempted')
        .eq('user_id', userId)
        .gte('questions_attempted', 3)
        .order('mastery_level', { ascending: true })
        .limit(limit);

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      const result = (data || []).map((row) => ({
        topic: row.topic_id as string,
        subject: '',
        weakness_score: Math.max(0, 100 - Number(row.mastery_level || 0) * 100),
        accuracy_percentage: Number(row.accuracy || 0),
      }));

      cache.set(cacheKey, result, CACHE_TTL.SHORT, [CACHE_TAGS.USER]);

      return { data: result, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Calculate topic mastery (queue-managed edge function call)
   */
  async calculateTopicMastery(
    subject: string,
    chapter: string,
    topic: string
  ): Promise<ApiResponse<{ success: boolean; mastery?: number }>> {
    try {
      const { data, error } = await apiClient.callEdgeFunction<{ subject: string; chapter: string; topic: string }, { success: boolean; mastery?: number }>(
        'calculate-topic-mastery',
        { subject, chapter, topic },
        { useQueue: true, priority: 'normal' }
      );

      if (error) {
        return { data: null, error };
      }

      // Invalidate mastery cache
      const { data: { user } } = await apiClient.rawClient.auth.getUser();
      if (user) {
        cache.invalidateByPattern(`user:mastery:${user.id}`);
        cache.invalidateByPattern(`user:weakness:${user.id}`);
      }

      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Get user's batch subscriptions
   */
  async getSubscriptions(userId: string): Promise<ApiResponse<Array<{
    batch_id: string;
    tier: 'free' | 'pro';
    expires_at: string;
    status: string;
  }>>> {
    const cacheKey = `user:subscriptions:${userId}`;
    const cached = cache.get<Array<{
      batch_id: string;
      tier: 'free' | 'pro';
      expires_at: string;
      status: string;
    }>>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    type SubscriptionRow = { batch_id: string; tier: 'free' | 'pro'; expires_at: string; status: string };
    
    try {
      const { data, error } = await apiClient.rawClient
        .from('user_batch_subscriptions')
        .select('batch_id, tier, expires_at, status')
        .eq('user_id', userId)
        .eq('status', 'active') as unknown as { data: SubscriptionRow[] | null; error: { message: string; code: string } | null };

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Filter to only active (non-expired) subscriptions
      const activeSubscriptions = (data || []).filter(
        sub => new Date(sub.expires_at) > new Date()
      );

      cache.set(cacheKey, activeSubscriptions, CACHE_TTL.MEDIUM, [CACHE_TAGS.USER]);

      return { data: activeSubscriptions, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Create or update batch subscription
   */
  async createSubscription(
    userId: string,
    batchId: string,
    tier: 'free' | 'pro',
    validityDays: number
  ): Promise<ApiResponse<{ id: string }>> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validityDays);

      const { data, error } = await apiClient.rawClient
        .from('user_batch_subscriptions')
        .upsert({
          user_id: userId,
          batch_id: batchId,
          expires_at: expiresAt.toISOString(),
          status: 'active',
        }, {
          onConflict: 'user_id,batch_id'
        })
        .select('id')
        .single();

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } };
      }

      // Invalidate subscriptions cache
      cache.delete(`user:subscriptions:${userId}`);
      cache.invalidateByTag(CACHE_TAGS.USER);

      return { data: { id: data.id }, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Invalidate user cache
   */
  invalidateCache(userId?: string): void {
    if (userId) {
      cache.invalidateByPattern(`user:.*:${userId}`);
    } else {
      cache.invalidateByTag(CACHE_TAGS.USER);
    }
  },
};

import safeLocalStorage from '@/utils/safeStorage';
/**
 * Tests API Module
 * 
 * Handles all test-related API operations
 */

import { apiClient } from '../apiClient';
import { cache, CACHE_TTL, CACHE_TAGS } from '../cache';
import { assessmentsAPI } from './assessments';
import { logger } from '@/utils/logger';
import type { TestSession, Question, ApiResponse, PaginatedResponse } from '../types';

const PENDING_TEST_SYNC_KEY = 'pendingTestSyncs';

export interface TestConfig {
  title: string;
  testType: 'practice' | 'chapter' | 'full_length' | 'custom';
  questionCount: number;
  timeLimit?: number; // in minutes
  filters?: {
    subject?: string;
    chapter_id?: string;
    topic_id?: string;
    difficulty?: string;
  };
}

export interface TestResult {
  session: TestSession;
  questions: Question[];
  answers: Record<string, {
    selectedOption: string | null;
    isCorrect: boolean;
    timeSpent: number;
  }>;
}

export interface PendingTestAttempt {
  user_id: string;
  question_id: string;
  selected_option: string;
  is_correct: boolean;
  time_spent: number;
}

export interface PendingTestSyncPayload {
  id: string;
  userId: string;
  subject: string;
  totalQuestions: number;
  correctAnswers: number;
  totalTime: number;
  attemptedQuestions?: number;
  groupTestId?: string;
  sessionId?: string | null;
  attempts: PendingTestAttempt[];
  createdAt: string;
}

const readPendingTestSyncs = (): PendingTestSyncPayload[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = safeLocalStorage.getItem(PENDING_TEST_SYNC_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as PendingTestSyncPayload[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writePendingTestSyncs = (items: PendingTestSyncPayload[]): void => {
  if (typeof localStorage === 'undefined') return;
  safeLocalStorage.setItem(PENDING_TEST_SYNC_KEY, JSON.stringify(items.slice(0, 20)));
};

export const testsAPI = {
  queuePendingTestSync(_payload: Omit<PendingTestSyncPayload, 'id' | 'createdAt'>): void {
    // Legacy assertions remain local/unverified. Never replay them as evidence.
    logger.warn('Legacy result sync is not authorized; raw issued drafts are required');
  },
  getPendingTestSyncCount(): number { return readPendingTestSyncs().length; },
  async flushPendingTestSyncs(_targetUserId?: string) { return { synced: 0, remaining: readPendingTestSyncs().length }; },
  async reserveTestSessionLegacy(..._args: unknown[]): Promise<ApiResponse<{ id: string }>> {
    return { data: null, error: { code: '42501', message: 'A server-issued assessment is required' } };
  },
  async saveTestSessionLegacy(..._args: unknown[]): Promise<ApiResponse<{ id: string }>> {
    return { data: null, error: { code: '42501', message: 'Legacy results cannot authorize completion' } };
  },
  async validateAnswerLegacy(..._args: unknown[]): Promise<ApiResponse<{ isCorrect: boolean }>> {
    return { data: null, error: { code: '42501', message: 'Issued-item submission required' } };
  },
  async createTest(_userId: string, _batchId: string | null, config: TestConfig): Promise<ApiResponse<{ session: TestSession; questions: Question[] }>> {
    try {
      const issued = await assessmentsAPI.issue({ purpose: 'test', title: config.title, count: config.questionCount, duration: config.timeLimit || 60, ...config.filters });
      return { data: { session: issued as unknown as TestSession, questions: issued.questions as unknown as Question[] }, error: null };
    } catch { return { data: null, error: { code: '42501', message: 'Verified test unavailable' } }; }
  },
  async getTestSession(sessionId: string): Promise<ApiResponse<TestResult>> {
    try { return { data: await assessmentsAPI.review(sessionId) as unknown as TestResult, error: null }; }
    catch { return { data: null, error: { code: '42501', message: 'Verified review unavailable' } }; }
  },
  async submitAnswer(..._args: unknown[]): Promise<ApiResponse<{ isCorrect: boolean; pointsEarned: number }>> {
    return { data: null, error: { code: '42501', message: 'Submit through the issued assessment' } };
  },
  async completeTest(sessionId: string): Promise<ApiResponse<TestSession>> {
    try { await assessmentsAPI.complete(sessionId, {}, crypto.randomUUID()); return { data: await assessmentsAPI.get(sessionId) as unknown as TestSession, error: null }; }
    catch { return { data: null, error: { code: '42501', message: 'Completion not confirmed' } }; }
  },
  /**
   * Get user's test history (paginated)
   */
  async getUserTests(
    userId: string,
    page = 1,
    pageSize = 20
  ): Promise<PaginatedResponse<TestSession>> {
    return apiClient.fetchPaginated('test_sessions', {
      page,
      pageSize,
      filters: { user_id: userId, status: 'completed' } as Record<string, unknown>,
      orderBy: 'completed_at',
      orderDirection: 'desc',
      cacheTTL: CACHE_TTL.SHORT,
      cacheTags: [CACHE_TAGS.TESTS],
    }) as unknown as Promise<PaginatedResponse<TestSession>>;
  },

  /**
   * Get test statistics
   */
  async getTestStats(userId: string): Promise<ApiResponse<{
    totalTests: number;
    averageScore: number;
    totalTime: number;
    bestScore: number;
    recentTrend: number[];
  }>> {
    const cacheKey = `test:stats:${userId}`;
    const cached = cache.get<{
      totalTests: number;
      averageScore: number;
      totalTime: number;
      bestScore: number;
      recentTrend: number[];
    }>(cacheKey);
    if (cached) {
      return { data: cached, error: null };
    }

    try {
      const { data: tests } = await apiClient.rawClient
        .from('test_sessions')
        .select('score, time_taken')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(100);

      if (!tests || tests.length === 0) {
        return {
          data: {
            totalTests: 0,
            averageScore: 0,
            totalTime: 0,
            bestScore: 0,
            recentTrend: [],
          },
          error: null,
        };
      }

      const scores = tests.map(t => t.score);
      const stats = {
        totalTests: tests.length,
        averageScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        totalTime: tests.reduce((a, t) => a + t.time_taken, 0),
        bestScore: Math.max(...scores),
        recentTrend: scores.slice(0, 10).reverse(), // Last 10 scores
      };

      cache.set(cacheKey, stats, CACHE_TTL.SHORT, [CACHE_TAGS.TESTS]);

      return { data: stats, error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: (error as Error).message, code: 'ERROR' },
      };
    }
  },

  /**
   * Invalidate tests cache
   */
  invalidateCache(): void {
    cache.invalidateByTag(CACHE_TAGS.TESTS);
  },

};

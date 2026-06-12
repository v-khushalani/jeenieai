import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PointsService } from '../pointsService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => ({ data: [], error: null })),
          then: (resolve: (value: any) => any) => Promise.resolve({ data: [], error: null }).then(resolve),
        })),
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => ({ data: null, error: null })),
          single: vi.fn(() => ({ data: null, error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}));

describe('PointsService - Extended', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('calculateLevel edge cases', () => {
    it('BEGINNER max boundary (1000)', () => {
      const level = PointsService.calculateLevel(1000);
      expect(level.name).toBe('BEGINNER');
      expect(level.progress).toBe(100);
    });

    it('LEARNER min boundary (1001)', () => {
      expect(PointsService.calculateLevel(1001).name).toBe('LEARNER');
    });

    it('ACHIEVER range (5000)', () => {
      expect(PointsService.calculateLevel(5000).name).toBe('ACHIEVER');
    });

    it('EXPERT range (10000)', () => {
      expect(PointsService.calculateLevel(10000).name).toBe('EXPERT');
    });

    it('MASTER range (30000)', () => {
      expect(PointsService.calculateLevel(30000).name).toBe('MASTER');
    });

    it('correct pointsToNext', () => {
      expect(PointsService.calculateLevel(500).pointsToNext).toBe(500);
    });
  });

  describe('getUserRank', () => {
    it('returns 0 when no users exist', async () => {
      expect(await PointsService.getUserRank('test')).toBe(0);
    });
  });

  describe('getLeaderboard', () => {
    it('returns empty array when no data', async () => {
      expect(await PointsService.getLeaderboard(10)).toEqual([]);
    });
  });
});

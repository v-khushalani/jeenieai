import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PointsService } from '../pointsService';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
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

describe('PointsService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('calculateLevel', () => {
    it('returns BEGINNER for 0 points', () => {
      expect(PointsService.calculateLevel(0).name).toBe('BEGINNER');
    });

    it('returns LEARNER for 1500 points', () => {
      expect(PointsService.calculateLevel(1500).name).toBe('LEARNER');
    });

    it('returns LEGEND for 100000 points', () => {
      const level = PointsService.calculateLevel(100000);
      expect(level.name).toBe('LEGEND');
      expect(level.pointsToNext).toBe(0);
    });
  });

  describe('getUserPoints', () => {
    it('returns defaults for missing profile', async () => {
      const result = await PointsService.getUserPoints('nonexistent');
      expect(result.totalPoints).toBe(0);
      expect(result.level).toBe('BEGINNER');
    });
  });
});

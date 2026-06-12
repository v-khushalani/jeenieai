import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Supabase with proper chain termination ────────────
// Each supabase query chain ends with an await. We need the chain
// to be "thenable" so that await resolves to { data, error }.

function createMockChain(resolveWith: any = { data: null, error: null }) {
  const chain: any = {
    // Make the chain thenable so `await chain` works
    then(resolve: any, reject?: any) {
      return Promise.resolve(resolveWith).then(resolve, reject);
    },
  };
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveWith);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolveWith);
  return chain;
}

// Track sequential from() calls — each returns a different chain
let fromCallIndex = 0;
let fromChains: any[] = [];
const mockRpc = vi.fn();

const mockFrom = vi.fn((...args: any[]) => {
  const chain = fromChains[fromCallIndex] || createMockChain();
  fromCallIndex++;
  return chain;
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

import { StreakService } from '../streakService';

// ─── Tests ──────────────────────────────────────────────────

describe('StreakService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromCallIndex = 0;
    fromChains = [];
    mockRpc.mockResolvedValue({ data: { success: true, streak: 0, reset: false }, error: null });
  });

  describe('calculateDailyTarget', () => {
    it('returns 15 as default when no attempts exist', async () => {
      // 1st from(): question_attempts query → empty array (chain resolves with data after .order())
      fromChains[0] = createMockChain({ data: [], error: null });
      // 2nd from(): profiles query → .single() returns profile
      fromChains[1] = createMockChain({ data: { created_at: new Date().toISOString() }, error: null });

      const target = await StreakService.calculateDailyTarget('user1');
      expect(target).toBe(15);
    });

    it('returns 15 on error', async () => {
      fromChains[0] = createMockChain({ data: null, error: { message: 'DB error' } });
      const target = await StreakService.calculateDailyTarget('user1');
      expect(target).toBe(15);
    });

    it('increases target for high accuracy users', async () => {
      // 100 attempts, 90 correct
      const attempts = Array.from({ length: 100 }, (_, i) => ({
        is_correct: i < 90,
        created_at: new Date().toISOString(),
      }));
      fromChains[0] = createMockChain({ data: attempts, error: null });

      // User active for 10 weeks
      const tenWeeksAgo = new Date();
      tenWeeksAgo.setDate(tenWeeksAgo.getDate() - 70);
      fromChains[1] = createMockChain({ data: { created_at: tenWeeksAgo.toISOString() }, error: null });

      // store7DayAccuracy upsert
      fromChains[2] = createMockChain({ data: null, error: null });

      const target = await StreakService.calculateDailyTarget('user1');
      // 15 + (10 weeks * 5 for 90%+ accuracy) = 65
      expect(target).toBeGreaterThan(15);
      expect(target).toBeLessThanOrEqual(75);
    });

    it('caps target at 75', async () => {
      const attempts = Array.from({ length: 100 }, (_, i) => ({
        is_correct: i < 95,
        created_at: new Date().toISOString(),
      }));
      fromChains[0] = createMockChain({ data: attempts, error: null });

      // User active for 50 weeks
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 350);
      fromChains[1] = createMockChain({ data: { created_at: longAgo.toISOString() }, error: null });
      fromChains[2] = createMockChain({ data: null, error: null });

      const target = await StreakService.calculateDailyTarget('user1');
      expect(target).toBeLessThanOrEqual(75);
    });
  });

  describe('getTodayProgress', () => {
    it('returns existing progress if found', async () => {
      const progress = {
        user_id: 'user1',
        date: new Date().toISOString().split('T')[0],
        daily_target: 20,
        questions_completed: 5,
        target_met: false,
      };
      // daily_progress query returns a list and service takes the first row
      fromChains[0] = createMockChain({ data: [progress], error: null });

      const result = await StreakService.getTodayProgress('user1');
      expect(result).toEqual(progress);
    });

    it('creates new progress record if none exists', async () => {
      // First query: daily_progress returns no rows
      fromChains[0] = createMockChain({ data: [], error: null });

      // calculateDailyTarget: question_attempts → empty (returns 15 early, no profiles query)
      fromChains[1] = createMockChain({ data: [], error: null });

      // profiles query for daily_goal (from Promise.all)
      const profileChain = createMockChain({ data: { daily_goal: 15 }, error: null });
      profileChain.single = vi.fn().mockResolvedValue({ data: { daily_goal: 15 }, error: null });
      fromChains[2] = profileChain;

      // Insert new daily_progress → .insert().select().single()
      const newProgress = {
        user_id: 'user1',
        date: new Date().toISOString().split('T')[0],
        daily_target: 15,
        questions_completed: 0,
        target_met: false,
      };
      // Final fetch should return an array with the new progress row
      const insertChain = createMockChain({ data: [newProgress], error: null });
      insertChain.single = vi.fn().mockResolvedValue({ data: newProgress, error: null });
      fromChains[3] = insertChain;

      const result = await StreakService.getTodayProgress('user1');
      expect(result).toEqual(newProgress);
    });
  });

  describe('checkAndResetStreak', () => {
    it('returns streak from RPC response', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, streak: 10, reset: false }, error: null });

      const streak = await StreakService.checkAndResetStreak('user1');

      expect(streak).toBe(10);
      expect(mockRpc).toHaveBeenCalledWith('check_and_reset_streak', { p_user_id: 'user1' });
    });

    it('returns reset streak value when RPC resets user streak', async () => {
      mockRpc.mockResolvedValueOnce({ data: { success: true, streak: 0, reset: true }, error: null });

      const streak = await StreakService.checkAndResetStreak('user1');

      expect(streak).toBe(0);
      expect(mockRpc).toHaveBeenCalledWith('check_and_reset_streak', { p_user_id: 'user1' });
    });

    it('returns 0 when RPC call throws', async () => {
      mockRpc.mockRejectedValueOnce(new Error('RPC failed'));

      const streak = await StreakService.checkAndResetStreak('user1');

      expect(streak).toBe(0);
    });

    it('handles missing streak payload gracefully', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null });

      await expect(StreakService.checkAndResetStreak('nonexistent')).resolves.toBe(0);
    });
  });
});

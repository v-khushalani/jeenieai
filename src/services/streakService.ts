// src/services/streakService.ts
// Streak reads + daily progress management
// All streak WRITES go through update_streak_stats RPC (PracticePage)
// Streak RESET goes through check_and_reset_streak RPC
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

export class StreakService {

  static async calculateDailyTarget(userId: string): Promise<number> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: attempts, error } = await supabase
        .from('question_attempts')
        .select('is_correct, created_at')
        .eq('user_id', userId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const totalAttempts = attempts?.length || 0;
      if (totalAttempts === 0) return 15;

      const correctAttempts = attempts?.filter(a => a.is_correct).length || 0;
      const accuracy = (correctAttempts / totalAttempts) * 100;

      const { data: userData } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', userId)
        .single();

      const weeksActive = Math.floor(
        (Date.now() - new Date(userData?.created_at || Date.now()).getTime()) /
        (1000 * 60 * 60 * 24 * 7)
      );

      let weeklyIncrease = 0;
      if (accuracy < 50) weeklyIncrease = 0;
      else if (accuracy < 60) weeklyIncrease = 1;
      else if (accuracy < 70) weeklyIncrease = 2;
      else if (accuracy < 80) weeklyIncrease = 3;
      else if (accuracy < 90) weeklyIncrease = 4;
      else weeklyIncrease = 5;

      const newTarget = Math.min(15 + (weeksActive * weeklyIncrease), 75);

      await this.store7DayAccuracy(userId, accuracy);

      return Math.max(newTarget, 15);
    } catch (error) {
      logger.error('Error calculating daily target:', error);
      return 15;
    }
  }

  /**
   * Dynamic daily goal (streak target — NOT a paywall limit).
   * Looks at the last 7 days of real activity (every mode except tests) and
   * nudges the goal up/down so it stays challenging but achievable.
   * Runs at most once per day per user.
   */
  static async refreshDynamicGoal(userId: string): Promise<number | null> {
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
    const cacheKey = `dynamicGoalSynced:${userId}`;
    try {
      if (localStorage.getItem(cacheKey) === today) return null;
    } catch { /* storage unavailable — just recompute */ }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('daily_goal, smart_goal_enabled, goal_locked')
        .eq('id', userId)
        .single();

      // Manual goal / locked goal → never override the student's choice.
      if (profile?.goal_locked || profile?.smart_goal_enabled === false) return null;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: attempts } = await supabase
        .from('question_attempts')
        .select('is_correct, created_at')
        .eq('user_id', userId)
        .neq('mode', 'test')
        .gte('created_at', sevenDaysAgo.toISOString());

      const rows = attempts || [];
      const current = profile?.daily_goal || 15;
      if (rows.length === 0) return current;

      const activeDays = new Set(
        rows.map(a => new Date(new Date(a.created_at as string).getTime() + 5.5 * 3600 * 1000)
          .toISOString().split('T')[0])
      ).size;
      const avgPerActiveDay = rows.length / Math.max(1, activeDays);
      const accuracy = (rows.filter(a => a.is_correct).length / rows.length) * 100;

      // Base on what the student actually sustains, then adjust by accuracy.
      let target = avgPerActiveDay;
      if (accuracy >= 80) target *= 1.2;
      else if (accuracy >= 65) target *= 1.1;
      else if (accuracy < 50) target *= 0.9;

      // Consistency bonus: showing up most days earns a bigger goal.
      if (activeDays >= 6) target += 5;
      else if (activeDays >= 4) target += 2;

      let next = Math.round(Math.min(75, Math.max(15, target)) / 5) * 5;
      // Smooth: never jump more than 10 in a single day.
      next = Math.max(current - 10, Math.min(current + 10, next));
      next = Math.min(75, Math.max(15, next));

      if (next !== current) {
        await supabase.from('profiles').update({ daily_goal: next }).eq('id', userId);
      }

      try { localStorage.setItem(cacheKey, today); } catch { /* ignore */ }
      return next;
    } catch (error) {
      logger.error('Error refreshing dynamic goal:', error);
      return null;
    }
  }

  private static async store7DayAccuracy(userId: string, accuracy: number) {
    await supabase.rpc('update_daily_accuracy', {
      p_user_id: userId,
      p_accuracy: accuracy,
    });
  }


  static async getTodayProgress(userId: string) {
    const today = new Date().toISOString().split('T')[0];

    const { data: progressRows, error } = await supabase
      .from('daily_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .order('updated_at', { ascending: false })
      .limit(1);

    let progress = progressRows?.[0] || null;

    if (error || !progress) {
      const [calculatedTarget, profileResult] = await Promise.all([
        this.calculateDailyTarget(userId),
        supabase
          .from('profiles')
          .select('daily_goal')
          .eq('id', userId)
          .single()
      ]);

      const profileGoal = profileResult.data?.daily_goal || 15;
      const dailyTarget = Math.max(profileGoal, calculatedTarget);

      // Ensure today's row exists via server-side RPC (cannot insert directly anymore)

      await supabase.rpc('ensure_daily_progress', {
        p_user_id: userId,
        p_daily_target: dailyTarget,
      });

      const { data: newProgressRows } = await supabase
        .from('daily_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .order('updated_at', { ascending: false })
        .limit(1);

      progress = newProgressRows?.[0] ?? null;
    }

    return progress;
  }


  /**
   * Check and reset streak via security definer RPC.
   * Call on login / streak data load.
   */
  static async checkAndResetStreak(userId: string): Promise<number> {
    try {
      const { data } = await supabase.rpc('check_and_reset_streak', {
        p_user_id: userId
      });
      const result = data as { success?: boolean; streak?: number; reset?: boolean } | null;
      if (result?.reset) {
        logger.info('Streak was reset to 0 via RPC', { userId });
      }
      return result?.streak ?? 0;
    } catch (error) {
      logger.error('Error checking streak reset:', error);
      return 0;
    }
  }

  static async getStreakStatus(userId: string) {
    // Reset streak if broken via RPC
    await this.checkAndResetStreak(userId);

    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, streak_freeze_available')
      .eq('id', userId)
      .single();

    const todayProgress = await this.getTodayProgress(userId);

    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('question_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('mode', 'test')
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`);

    const questionsCompletedToday = count || 0;

    return {
      currentStreak: profile?.current_streak || 0,
      longestStreak: profile?.longest_streak || 0,
      todayTarget: todayProgress?.daily_target || 15,
      todayCompleted: questionsCompletedToday,
      targetMet: questionsCompletedToday >= (todayProgress?.daily_target || 15),
      streakFreezeAvailable: profile?.streak_freeze_available || false,
      accuracy7Day: todayProgress?.accuracy_7day || 0
    };
  }
}

export default StreakService;

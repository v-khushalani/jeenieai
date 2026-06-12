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
      .eq('mode', 'practice')
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

// src/services/pointsService.ts
// READ-ONLY service — all writes go through security definer RPCs
// (update_practice_stats, update_streak_stats) called from PracticePage
import { supabase } from '@/integrations/supabase/client';

export class PointsService {

  static async getUserPoints(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      return {
        totalPoints: 0,
        level: 'BEGINNER',
        levelProgress: 0,
        answerStreak: 0,
        longestAnswerStreak: 0,
        badges: [],
        levelInfo: this.calculateLevel(0)
      };
    }

    return {
      totalPoints: profile.total_points || 0,
      level: profile.level || 'BEGINNER',
      levelProgress: profile.level_progress || 0,
      answerStreak: 0,
      longestAnswerStreak: profile.longest_streak || 0,
      badges: profile.badges || [],
      levelInfo: this.calculateLevel(profile.total_points || 0)
    };
  }

  static calculateLevel(points: number): {
    name: string;
    progress: number;
    emoji: string;
    nextLevel: string;
    pointsToNext: number;
  } {
    const levels = [
      { name: 'BEGINNER', min: 0, max: 1000, emoji: '🌱', next: 'LEARNER' },
      { name: 'LEARNER', min: 1001, max: 3000, emoji: '📘', next: 'ACHIEVER' },
      { name: 'ACHIEVER', min: 3001, max: 7000, emoji: '📗', next: 'EXPERT' },
      { name: 'EXPERT', min: 7001, max: 20000, emoji: '🎓', next: 'MASTER' },
      { name: 'MASTER', min: 20001, max: 50000, emoji: '👑', next: 'LEGEND' },
      { name: 'LEGEND', min: 50001, max: Infinity, emoji: '⚡', next: 'MAX' }
    ];

    for (const level of levels) {
      if (points >= level.min && points <= level.max) {
        const progress = level.max === Infinity
          ? 100
          : ((points - level.min) / (level.max - level.min)) * 100;

        return {
          name: level.name,
          progress: Math.min(progress, 100),
          emoji: level.emoji,
          nextLevel: level.next,
          pointsToNext: level.max === Infinity ? 0 : level.max - points
        };
      }
    }

    return { name: 'BEGINNER', progress: 0, emoji: '🌱', nextLevel: 'LEARNER', pointsToNext: 1000 };
  }

  static async getLeaderboard(limit: number = 100) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, total_points, level, badges')
      .order('total_points', { ascending: false })
      .limit(limit);

    return (data || []).map((entry: any, index: number) => ({
      rank: index + 1,
      userId: entry.id,
      email: entry.full_name || 'Anonymous',
      points: entry.total_points || 0,
      level: entry.level || 'BEGINNER',
      badges: entry.badges || []
    }));
  }

  static async getUserRank(userId: string): Promise<number> {
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id, total_points')
      .order('total_points', { ascending: false });

    if (!allUsers) return 0;
    return allUsers.findIndex(u => u.id === userId) + 1;
  }
}

export default PointsService;

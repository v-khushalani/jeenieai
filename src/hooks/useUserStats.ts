import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import PointsService from '@/services/pointsService';
import { logger } from '@/utils/logger';
import { normalizeProgram, PROGRAM_SUBJECTS } from '@/utils/programConfig';
import { parseGrade } from '@/utils/gradeParser';

export interface UserStats {
  totalQuestions: number;
  questionsToday: number;
  questionsWeek: number;
  correctAnswers: number;
  accuracy: number;
  todayAccuracy: number;
  accuracyChange: number | null;
  streak: number;
  rank: number | null;
  rankChange: number | null;
  percentile: number | null;
  todayGoal: number;
  todayProgress: number;
  weakestTopic: string;
  strongestTopic: string;
  avgQuestionsPerDay: number;
  topRankersAvg: number | null;
  subjectStats: Record<string, { correct: number; total: number }>;
  pointsToNext: number;
  currentLevel: number;
  totalPoints: number;
}

export const useUserStats = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUserData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // PARALLEL: fetch everything independent in one round-trip batch.
      const istOffset = 5.5 * 60 * 60 * 1000;
      const todayStr = new Date(Date.now() + istOffset).toISOString().split('T')[0];

      const [
        profileRes,
        attemptsRes,
        countRes,
        dailyProgRes,
        leaderboardRes,
        levelInfoRes,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, current_streak, daily_goal, total_points, total_questions_solved, overall_accuracy, target_exam, grade")
          .eq("id", user.id)
          .single(),
        supabase
          .from("question_attempts")
          .select("is_correct, created_at, question_id, mode")
          .eq("user_id", user.id)
          .eq("mode", "practice")
          .order("created_at", { ascending: false })
          .limit(3000),
        supabase
          .from('question_attempts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('mode', 'practice'),
        supabase
          .from('daily_progress')
          .select('questions_completed, questions_correct')
          .eq('user_id', user.id)
          .eq('date', todayStr)
          .order('created_at', { ascending: false })
          .limit(1),
        Promise.resolve(supabase.rpc('get_leaderboard_with_stats', { limit_count: 100 })).catch(() => ({ data: null } as any)),
        PointsService.getUserPoints(user.id).catch(() => null),
      ]);

      const { data: profileData, error: profileError } = profileRes as any;
      if (profileError) { logger.error("Profile fetch error:", profileError); throw profileError; }
      setProfile(profileData);

      const { data: practiceAttempts, error: attemptsError } = attemptsRes as any;
      if (attemptsError) { logger.error("Attempts fetch error:", attemptsError); throw attemptsError; }

      // PARALLEL question metadata chunks (was a serial await loop).
      const questionIds = [...new Set((practiceAttempts || []).map((a: any) => a.question_id))] as string[];
      const questionMeta: Record<string, any> = {};
      if (questionIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < questionIds.length; i += 500) chunks.push(questionIds.slice(i, i + 500));
        const metaResults = await Promise.all(
          chunks.map(chunk =>
            supabase.from("questions_public").select("id, subject, topic, chapter").in("id", chunk)
          )
        );
        metaResults.forEach(({ data: qData }: any) => {
          (qData || []).forEach((q: any) => { questionMeta[q.id] = q; });
        });
      }

      const attempts = (practiceAttempts || []).map(a => ({
        ...a,
        subject: questionMeta[a.question_id]?.subject || null,
        topic: questionMeta[a.question_id]?.topic || null,
        chapter: questionMeta[a.question_id]?.chapter || null,
      }));

      // Date calculations
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      twoWeeksAgo.setHours(0, 0, 0, 0);

      const attemptsWithDate = attempts
        .map(a => {
          const d = new Date(a.created_at);
          return isNaN(d.getTime()) ? null : { ...a, parsedDate: d };
        })
        .filter(Boolean) as any[];

      // Use authoritative count from question_attempts (already fetched in parallel above).
      let trueTotal = attemptsWithDate.length;
      const practiceCount = (countRes as any)?.count;
      if (typeof practiceCount === 'number') trueTotal = practiceCount;
      const totalQuestions = trueTotal;
      // Source of truth: profiles.overall_accuracy (auto-synced by DB trigger).
      // Falls back to live aggregate from sampled attempts if profile value is null.
      const liveAccuracy = attemptsWithDate.length > 0
        ? Math.round((attemptsWithDate.filter(a => a.is_correct).length / attemptsWithDate.length) * 100)
        : 0;
      const accuracy = profileData?.overall_accuracy != null
        ? Math.round(Number(profileData.overall_accuracy))
        : liveAccuracy;
      const correctAnswers = Math.round((totalQuestions * accuracy) / 100);

      // Today's stats — use daily_progress (already fetched above)
      let todayTotal = 0;
      let todayCorrect = 0;
      const dailyProg = (dailyProgRes as any)?.data?.[0] || null;

      if (dailyProg) {
        todayTotal = dailyProg.questions_completed || 0;
        todayCorrect = dailyProg.questions_correct || 0;
      } else {
        // Fallback to counting attempts
        const todayAttempts = attemptsWithDate.filter(a => {
          const d = new Date(a.parsedDate);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        });
        todayTotal = todayAttempts.length;
        todayCorrect = todayAttempts.filter(a => a.is_correct).length;
      }

      const todayAccuracy = todayTotal > 0 ? Math.round((todayCorrect / todayTotal) * 100) : 0;

      // Week stats
      const weekAttempts = attemptsWithDate.filter(a => a.parsedDate >= weekAgo);
      const weekCorrect = weekAttempts.filter(a => a.is_correct).length;
      const weekAccuracy = weekAttempts.length > 0 ? Math.round((weekCorrect / weekAttempts.length) * 100) : 0;

      // Previous week
      const prevWeekAttempts = attemptsWithDate.filter(a => a.parsedDate >= twoWeeksAgo && a.parsedDate < weekAgo);
      const prevWeekCorrect = prevWeekAttempts.filter(a => a.is_correct).length;
      const prevWeekAccuracy = prevWeekAttempts.length > 0 ? Math.round((prevWeekCorrect / prevWeekAttempts.length) * 100) : null;
      // null = not enough prior-week data to compare; do not show "0% week" in UI
      const accuracyChange: number | null = prevWeekAccuracy === null
        ? null
        : Math.round((weekAccuracy - prevWeekAccuracy) * 10) / 10;

      const streak = profileData.current_streak || 0;

      // Topic/Subject breakdown — limit subjects to the user's exam track
      // (e.g. JEE → P/C/M only, NEET → P/C/B). Prevents legacy attempts in
      // other subjects from showing up (e.g. Biology for a JEE student).
      const userProgram = normalizeProgram(profileData?.target_exam);
      const userGradeNum = parseGrade(profileData?.grade || 12);
      const allowedSubjects = new Set(
        (userGradeNum >= 11 ? (PROGRAM_SUBJECTS[userProgram] || []) : (PROGRAM_SUBJECTS['Class'] || []))
          .map(s => s.toLowerCase())
      );

      const topicStats: Record<string, { correct: number; total: number }> = {};
      const subjectStats: Record<string, { correct: number; total: number }> = {};
      attemptsWithDate.forEach(attempt => {
        const rawTopic = attempt.topic;
        const subject = attempt.subject;
        const chapter = attempt.chapter;

        // If topic is missing or generic (General/Misc), prefer chapter name for clarity
        const topicLabel = rawTopic && !['general','miscellaneous','misc'].includes(String(rawTopic).toLowerCase())
          ? rawTopic
          : (chapter ? `General — ${chapter}` : 'General');

        if (topicLabel) {
          if (!topicStats[topicLabel]) topicStats[topicLabel] = { correct: 0, total: 0 };
          topicStats[topicLabel].total++;
          if (attempt.is_correct) topicStats[topicLabel].correct++;
        }

        if (subject && allowedSubjects.has(String(subject).toLowerCase())) {
          if (!subjectStats[subject]) subjectStats[subject] = { correct: 0, total: 0 };
          subjectStats[subject].total++;
          if (attempt.is_correct) subjectStats[subject].correct++;
        }
      });

      let weakestTopic = "Not enough data";
      let strongestTopic = "Not enough data";
      let lowestAccuracy = 100;
      let highestAccuracy = 0;
      Object.entries(topicStats).forEach(([topic, s]) => {
        if (s.total >= 5) {
          const acc = (s.correct / s.total) * 100;
          if (acc < lowestAccuracy) { lowestAccuracy = acc; weakestTopic = topic; }
          if (acc > highestAccuracy) { highestAccuracy = acc; strongestTopic = topic; }
        }
      });

      const profileGoal = profileData?.daily_goal || 15;

      // Days active
      const earliestAttempt = attemptsWithDate.length > 0
        ? attemptsWithDate.reduce((prev, curr) =>
            new Date(prev.parsedDate) < new Date(curr.parsedDate) ? prev : curr
          )
        : null;
      let daysActive = 1;
      if (earliestAttempt) {
        const diff = Math.ceil(
          (new Date().setHours(0, 0, 0, 0) - new Date(earliestAttempt.parsedDate).setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24)
        );
        daysActive = Math.max(1, diff);
      }

      const avgQuestionsPerDay = Math.round(totalQuestions / daysActive);

      // Leaderboard
      let rank: number | null = null;
      let percentile: number | null = null;
      let topRankersAvg: number | null = null;

      try {
        const leaderboard = (leaderboardRes as any)?.data;
        if (Array.isArray(leaderboard)) {
          const idx = leaderboard.findIndex((p: any) => p.id === user.id);
          rank = idx >= 0 ? idx + 1 : null;
          percentile = idx >= 0 && leaderboard.length > 0
            ? Math.round(((leaderboard.length - idx) / leaderboard.length) * 10000) / 100
            : null;

          const topSlice = leaderboard.slice(0, 10);
          if (topSlice.length > 0) {
            const sum = topSlice.reduce((acc: number, p: any) => acc + (p.total_points || 0), 0);
            topRankersAvg = Math.round(sum / topSlice.length);
          }
        }
      } catch (err) {
        logger.error("Error computing leaderboard metrics:", err);
      }

      // Points and level (already fetched in parallel above)
      const totalPoints = profileData?.total_points || 0;
      const levelInfo = (levelInfoRes as any) || await PointsService.getUserPoints(user.id);
      const pointsToNext = levelInfo?.levelInfo?.pointsToNext ?? 0;
      const currentLevel = (() => {
        const levelName = levelInfo?.level;
        const levelMap: Record<string, number> = {
          'BEGINNER': 1, 'LEARNER': 2, 'ACHIEVER': 3, 'EXPERT': 4, 'MASTER': 5, 'LEGEND': 6
        };
        return levelMap[levelName] || 1;
      })();

      setStats({
        totalQuestions,
        questionsToday: todayTotal,
        questionsWeek: weekAttempts.length,
        correctAnswers,
        accuracy,
        todayAccuracy,
        accuracyChange,
        streak,
        rank,
        rankChange: null,
        percentile,
        todayGoal: profileGoal,
        todayProgress: todayTotal,
        weakestTopic,
        strongestTopic,
        avgQuestionsPerDay,
        topRankersAvg,
        subjectStats,
        pointsToNext,
        currentLevel,
        totalPoints,
      });
    } catch (err) {
      logger.error("Error loading user data:", err);
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('user-stats-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          loadUserData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadUserData]);

  return {
    stats,
    profile,
    loading,
    error,
    refresh: loadUserData,
  };
};

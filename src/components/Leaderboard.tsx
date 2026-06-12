// src/components/Leaderboard.tsx
// ✅ FIXED - Calculates stats from question_attempts for accurate leaderboard data

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Trophy, TrendingUp, TrendingDown, Flame, Zap, Crown, Target, Medal, Activity
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import { fetchAllPaginated } from "@/utils/supabasePagination";

interface LeaderboardUser {
  id: string;
  full_name: string;
  avatar_url?: string;
  total_questions: number;
  accuracy: number;
  total_points: number;
  streak: number;
  rank: number;
  rank_change: number;
  questions_today: number;
  level?: string;
}

interface LeaderboardProps {
  compact?: boolean;
}

const Leaderboard: React.FC<LeaderboardProps> = ({ compact = false }) => {
  const { user } = useAuth();
  const [topUsers, setTopUsers] = useState<LeaderboardUser[]>([]);
  const [currentUser, setCurrentUser] = useState<LeaderboardUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'alltime'>('week');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getDisplayName = (name?: string | null) => {
    const trimmed = String(name || '').trim();
    return trimmed || 'New User';
  };

  const fetchLeaderboard = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      else setIsRefreshing(true);

      // Compute date range for the selected time filter
      const now = new Date();
      let sinceDate: string | null = null;
      if (timeFilter === 'today') {
        sinceDate = now.toISOString().split('T')[0] + 'T00:00:00.000Z';
      } else if (timeFilter === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        sinceDate = weekAgo.toISOString();
      }
      // 'alltime' → sinceDate stays null (no filter)

      // Use RPC function to get leaderboard with aggregated stats (bypasses RLS)
      const { data: leaderboardData, error: rpcError } = await (supabase.rpc as any)('get_leaderboard_with_stats', { limit_count: 100 });

      if (rpcError) {
        logger.error('Leaderboard RPC error:', rpcError);
        // Fallback to profiles-only fetch if RPC fails (migration not applied)
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, total_points, current_streak, total_questions_solved, overall_accuracy')
          .order('total_points', { ascending: false })
          .limit(100);

        if (profileError || !profiles) {
          logger.error('Profile fetch error:', profileError);
          setTopUsers([]);
          setCurrentUser(null);
          setLoading(false);
          return;
        }

        // Build user stats from profile data (fallback)
        const userStats: LeaderboardUser[] = (profiles as any[])
          .filter((p: any) => p.id)
          .map((profile: any, index: number) => {
            const currentRank = index + 1;
            return {
              id: profile.id,
              full_name: getDisplayName(profile.full_name),
              avatar_url: profile.avatar_url || undefined,
              total_questions: profile.total_questions_solved || 0,
              accuracy: profile.overall_accuracy ? Math.round(Number(profile.overall_accuracy)) : 0,
              total_points: profile.total_points || 0,
              streak: profile.current_streak || 0,
              rank: currentRank,
              rank_change: 0,
              questions_today: 0
            };
          });

        setTopUsers(userStats.slice(0, 10));
        const current = userStats.find(u => u.id === user?.id);
        setCurrentUser(current || null);
        setLoading(false);
        return;
      }

      if (!leaderboardData || (leaderboardData as any[]).length === 0) {
        logger.info('No leaderboard data found');
        setTopUsers([]);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      logger.info('Fetched leaderboard data', { count: (leaderboardData as any[]).length, timeFilter });

      // For time-filtered views, re-rank by questions in period using question_attempts
      let periodQuestionCounts: Record<string, number> = {};
      if (sinceDate) {
        const userIds = (leaderboardData as any[]).map((e: any) => e.id);
        // Use paginated fetch to avoid 1000-row limit
        const periodAttempts = await fetchAllPaginated<{ user_id: string }>(() =>
          supabase
            .from('question_attempts')
            .select('user_id')
            .in('user_id', userIds)
            .gte('created_at', sinceDate)
        );

        for (const attempt of periodAttempts) {
          periodQuestionCounts[attempt.user_id] = (periodQuestionCounts[attempt.user_id] || 0) + 1;
        }
      }

      // Build user stats from RPC result
      let userStats: LeaderboardUser[] = (leaderboardData as any[])
        .filter((entry: any) => entry.id)
        .map((entry: any) => {
          return {
            id: entry.id,
            full_name: getDisplayName(entry.full_name),
            avatar_url: entry.avatar_url || undefined,
            total_questions: Number(entry.total_questions) || 0,
            accuracy: entry.accuracy ? Math.round(Number(entry.accuracy)) : 0,
            total_points: entry.total_points || 0,
            streak: entry.current_streak || 0,
            rank: 0,
            rank_change: 0,
            questions_today: 0
          };
        });

      // Re-sort by period question count when filtering by time, but keep users with zero activity
      if (sinceDate) {
        userStats = userStats.sort(
          (a, b) => (periodQuestionCounts[b.id] || 0) - (periodQuestionCounts[a.id] || 0)
        );
      }

      // Assign ranks after sorting
      userStats.forEach((u, index) => {
        u.rank = index + 1;
      });

      // Make sure the signed-in user is always visible, even before they have scores.
      if (user?.id && !userStats.some((u) => u.id === user.id)) {
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle();

        if (currentProfile?.id) {
          userStats.push({
            id: currentProfile.id,
            full_name: getDisplayName(currentProfile.full_name),
            avatar_url: currentProfile.avatar_url || undefined,
            total_questions: 0,
            accuracy: 0,
            total_points: 0,
            streak: 0,
            rank: userStats.length + 1,
            rank_change: 0,
            questions_today: 0,
          });
        }
      }

      userStats.forEach((u, index) => {
        u.rank = index + 1;
      });

      // Find current user
      const current = userStats.find(u => u.id === user?.id);
      if (current) {
        setCurrentUser(current);
        logger.info('Your rank', { rank: current.rank, points: current.total_points, questions: current.total_questions, accuracy: current.accuracy });
      } else {
        setCurrentUser(null);
      }

      setTopUsers(userStats.slice(0, 10));

    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      setTopUsers([]);
      setCurrentUser(null);
    } finally {
      if (showLoader) setLoading(false);
      else setIsRefreshing(false);
    }
  }, [user?.id, timeFilter]);

  useEffect(() => {
    fetchLeaderboard(true);
  }, [fetchLeaderboard]);

  useEffect(() => {
    // Polling is intentionally preferred here over broad realtime table listeners,
    // which can trigger request storms for every connected client at scale.
    const interval = setInterval(() => {
      fetchLeaderboard(false);
    }, 45000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLeaderboard(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchLeaderboard]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
    return null;
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "bg-linear-to-r from-yellow-400 to-orange-500 text-white";
    if (rank === 2) return "bg-linear-to-r from-gray-300 to-gray-500 text-white";
    if (rank === 3) return "bg-linear-to-r from-amber-400 to-orange-600 text-white";
    if (rank <= 10) return "bg-linear-to-r from-blue-500 to-indigo-600 text-white";
    return "bg-gray-200 text-gray-700";
  };

  if (loading) {
    return (
      <Card className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl">
        <CardContent className="p-6 flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="h-10 w-10 text-blue-500 animate-pulse mx-auto mb-3" />
            <p className="text-slate-600 text-sm">Loading leaderboard...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const compactUsers = compact ? topUsers.slice(0, 3) : topUsers;

  return (
    <Card className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl flex flex-col h-full min-h-0">
      <CardHeader className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-linear-to-br from-yellow-500 to-orange-600 p-2 rounded-lg">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Leaderboard</CardTitle>
              <p className="text-xs text-slate-500">
                {compact ? 'Top ranks + your position' : 'Compete with top performers'}
              </p>
            </div>
          </div>
          <Badge className={`text-white text-xs transition-all ${
            isRefreshing ? 'bg-orange-500 animate-pulse' : 'bg-green-500'
          }`}>
            <Activity className="h-3 w-3 mr-1" />
            {isRefreshing ? 'Updating...' : 'LIVE'}
          </Badge>
        </div>

        {/* Time Filter */}
        <div className={`flex gap-2 mt-3 ${compact ? 'flex-wrap' : ''}`}>
          <button
            onClick={() => setTimeFilter('today')}
            disabled={isRefreshing}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              timeFilter === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeFilter('week')}
            disabled={isRefreshing}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              timeFilter === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            This Week
          </button>
          <button
            onClick={() => setTimeFilter('alltime')}
            disabled={isRefreshing}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              timeFilter === 'alltime'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            } ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            All Time
          </button>
        </div>
      </CardHeader>

      <CardContent className={`p-4 space-y-3 flex-1 min-h-0 ${compact ? 'overflow-visible' : 'overflow-y-auto'}`}>
        
        {/* Empty State */}
        {topUsers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
            <div className="bg-linear-to-br from-orange-50 to-yellow-50 p-4 rounded-full mb-3">
              <Trophy className="h-8 w-8 text-orange-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Scores Yet</h3>
            <p className="text-xs text-slate-600">
              Start practicing to see yourself on the leaderboard!
            </p>
          </div>
        )}

        
        {/* Current User Card - hide in compact mobile mode */}
        {!compact && topUsers.length > 0 && currentUser && currentUser.rank > 10 && (
          <div className="mb-4 p-3 bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                  {currentUser.rank}
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">You</p>
                  <p className="text-xs text-slate-600">
                    {currentUser.total_points} pts • {currentUser.total_questions} questions
                  </p>
                </div>
              </div>
              {currentUser.rank_change !== 0 && (
                <Badge className={currentUser.rank_change > 0 ? 'bg-green-500' : 'bg-red-500'}>
                  {currentUser.rank_change > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(currentUser.rank_change)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Top Users */}
        {compact && topUsers.length > 0 && currentUser && currentUser.rank > 3 && (
          <div className="mb-3 p-3 bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-300">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {currentUser.rank}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900 truncate">You</p>
                  <p className="text-xs text-slate-600 truncate">
                    {currentUser.total_points} pts • {currentUser.total_questions} questions • {Math.round(currentUser.accuracy)}%
                  </p>
                </div>
              </div>
              {currentUser.rank_change !== 0 && (
                <Badge className={currentUser.rank_change > 0 ? 'bg-green-500' : 'bg-red-500'}>
                  {currentUser.rank_change > 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {Math.abs(currentUser.rank_change)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {compactUsers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No users found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {compactUsers.map((leaderUser, index) => {
              const isCurrentUser = leaderUser.id === currentUser?.id;
              
              return (
                <div
                  key={leaderUser.id}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isCurrentUser
                      ? 'bg-linear-to-r from-blue-50 to-indigo-50 border-blue-300 shadow-lg'
                      : index < 3
                      ? 'bg-linear-to-r from-yellow-50 to-orange-50 border-yellow-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${getRankBadge(leaderUser.rank)}`}>
                        {getRankIcon(leaderUser.rank) || leaderUser.rank}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-slate-900 truncate">
                            {isCurrentUser ? 'You' : leaderUser.full_name}
                          </p>
                          {leaderUser.streak >= 7 && (
                            <Badge className="bg-orange-500 text-white text-xs">
                              <Flame className="h-3 w-3 mr-1" />
                              {leaderUser.streak}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 flex-wrap">
                          <span className="flex items-center gap-1 font-bold text-indigo-600 whitespace-nowrap">
                            <Zap className="h-3 w-3" />
                            {leaderUser.total_points} pts
                          </span>
                          <span className="flex items-center gap-1 whitespace-nowrap">
                            <Target className="h-3 w-3" />
                            {Number(leaderUser.total_questions) || 0}Q
                          </span>
                          <span className={`font-semibold whitespace-nowrap ${
                            Number(leaderUser.accuracy) >= 80 ? 'text-green-600' :
                            Number(leaderUser.accuracy) >= 60 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {Math.round(Number(leaderUser.accuracy)) || 0}%
                          </span>
                        </div>

                        <Progress 
                          value={leaderUser.accuracy} 
                          className="h-1.5 mt-2"
                        />
                      </div>
                    </div>

                    {leaderUser.rank_change !== 0 && (
                      <div className={`flex items-center gap-1 text-xs font-bold ${
                        leaderUser.rank_change > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {leaderUser.rank_change > 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {Math.abs(leaderUser.rank_change)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {!compact && currentUser && topUsers.length > 0 && (
          <div className="mt-4 p-3 bg-linear-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-purple-600" />
              <p className="text-xs font-bold text-purple-900">Earn More Points!</p>
            </div>
            <p className="text-xs text-purple-700">
              {currentUser.rank > 1
                ? `Answer correctly to earn points and climb the ranks! 🚀`
                : "You're at the top! Maintain your position! 👑"}
            </p>
          </div>
        )}

      </CardContent>
    </Card>
  );
};

export default Leaderboard;

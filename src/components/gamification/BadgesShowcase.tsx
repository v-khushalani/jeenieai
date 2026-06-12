import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Award, Trophy, Star, Flame, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { logger } from '@/utils/logger';

interface BadgeType {
  id: string;
  name: string;
  description: string;
  icon: string;
  points_required: number;
  color: string;
  category: string;
  earned?: boolean;
  earned_at?: string;
}

interface DynamicBadge {
  name: string;
  icon: string;
  color: string;
  category: string;
  description: string;
}

// Map of dynamic badges that are awarded via profiles.badges JSON
const DYNAMIC_BADGE_META: Record<string, DynamicBadge> = {
  // Answer streak badges (PointsService)
  'Hot Streak': { name: 'Hot Streak', icon: '🔥', color: 'orange', category: 'Answer Streaks', description: '5 correct answers in a row!' },
  'On Fire': { name: 'On Fire', icon: '🔥', color: 'red', category: 'Answer Streaks', description: '10 correct answers in a row!' },
  'Unstoppable': { name: 'Unstoppable', icon: '⚡', color: 'purple', category: 'Answer Streaks', description: '20 correct answers in a row!' },
  'BEAST MODE': { name: 'BEAST MODE', icon: '👑', color: 'gold', category: 'Answer Streaks', description: '50 correct answers in a row!' },
  // Day streak badges (StreakService)
  '7-Day Warrior': { name: '7-Day Warrior', icon: '⚔️', color: 'blue', category: 'Day Streaks', description: '7 consecutive days of practice!' },
  '15-Day Champion': { name: '15-Day Champion', icon: '🏆', color: 'blue', category: 'Day Streaks', description: '15 consecutive days of practice!' },
  'Monthly Master': { name: 'Monthly Master', icon: '📅', color: 'green', category: 'Day Streaks', description: '30 consecutive days of practice!' },
  'Consistent Learner': { name: 'Consistent Learner', icon: '📚', color: 'green', category: 'Day Streaks', description: '60 consecutive days of practice!' },
  'Quarter Master': { name: 'Quarter Master', icon: '🎯', color: 'purple', category: 'Day Streaks', description: '90 consecutive days of practice!' },
  '4-Month Hero': { name: '4-Month Hero', icon: '🦸', color: 'purple', category: 'Day Streaks', description: '120 consecutive days of practice!' },
  'Half Year Legend': { name: 'Half Year Legend', icon: '⭐', color: 'gold', category: 'Day Streaks', description: '180 consecutive days of practice!' },
  'YEARLY CHAMPION': { name: 'YEARLY CHAMPION', icon: '👑', color: 'gold', category: 'Day Streaks', description: '365 consecutive days of practice!' },
};

const BadgesShowcase = () => {
  const [badges, setBadges] = useState<BadgeType[]>([]);
  const [dynamicBadges, setDynamicBadges] = useState<string[]>([]);
  const [userPoints, setUserPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch profile (points + dynamic badges), table badges, and user_badges in parallel
      const [profileResult, allBadgesResult, userBadgesResult] = await Promise.all([
        supabase.from('profiles').select('total_points, badges').eq('id', user.id).single(),
        supabase.from('badges').select('*').order('points_required', { ascending: true }),
        supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', user.id),
      ]);

      setUserPoints(profileResult.data?.total_points || 0);

      // Dynamic badges from profiles.badges JSON
      const rawBadges = profileResult.data?.badges;
      const earnedDynamic: string[] = Array.isArray(rawBadges)
        ? rawBadges.filter((b): b is string => typeof b === 'string')
        : [];
      setDynamicBadges(earnedDynamic);

      // Table-based badges
      const badgeMap = (userBadgesResult.data || []).reduce((acc: Record<string, string>, ub) => {
        acc[ub.badge_id] = ub.earned_at || '';
        return acc;
      }, {});

      const enrichedBadges = (allBadgesResult.data || []).map(badge => ({
        ...badge,
        earned: !!badgeMap[badge.id],
        earned_at: badgeMap[badge.id],
      }));

      setBadges(enrichedBadges);
    } catch (error) {
      logger.error('Error fetching badges:', error);
    } finally {
      setLoading(false);
    }
  };

  const categoryIcons: Record<string, React.ElementType> = {
    achievement: Trophy,
    skill: Star,
    subject: Award,
    streak: Flame,
    'Answer Streaks': Zap,
    'Day Streaks': Flame,
  };

  const colorClasses: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    yellow: 'from-yellow-500 to-yellow-600',
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
    gold: 'from-yellow-400 to-yellow-600',
  };

  // Build dynamic badge categories
  const dynamicCategories: Record<string, { earned: DynamicBadge[]; all: DynamicBadge[] }> = {};
  for (const [name, meta] of Object.entries(DYNAMIC_BADGE_META)) {
    if (!dynamicCategories[meta.category]) {
      dynamicCategories[meta.category] = { earned: [], all: [] };
    }
    dynamicCategories[meta.category].all.push(meta);
    if (dynamicBadges.includes(name)) {
      dynamicCategories[meta.category].earned.push(meta);
    }
  }

  // Table-based badge categories
  const tableCategories = Array.from(new Set(badges.map(b => b.category)));

  if (loading) return <Card className="p-8 text-center">Loading badges...</Card>;

  return (
    <div className="space-y-6">
      <Card className="bg-linear-to-br from-purple-50 to-pink-50 border-purple-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-purple-600" />
            Your Badge Collection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">

            {/* Dynamic Badges (Answer Streaks + Day Streaks) */}
            {Object.entries(dynamicCategories).map(([category, { earned, all }]) => {
              const CategoryIcon = categoryIcons[category] || Trophy;
              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="w-5 h-5 text-gray-700" />
                      <h3 className="font-bold text-gray-800">{category}</h3>
                    </div>
                    <Badge variant="secondary">{earned.length}/{all.length}</Badge>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {all.map(badge => {
                      const isEarned = dynamicBadges.includes(badge.name);
                      return (
                        <div key={badge.name} className="relative group">
                          <div className={`p-4 rounded-xl border-2 transition-all ${
                            isEarned
                              ? `bg-linear-to-br ${colorClasses[badge.color] || 'from-gray-400 to-gray-500'} border-white shadow-lg scale-105`
                              : 'bg-gray-100 border-gray-300 opacity-60'
                          }`}>
                            <div className="text-center space-y-2">
                              <div className={`text-4xl ${isEarned ? '' : 'grayscale'}`}>
                                {badge.icon}
                              </div>
                              <p className={`text-xs font-bold ${isEarned ? 'text-white' : 'text-gray-600'}`}>
                                {badge.name}
                              </p>
                            </div>
                          </div>
                          {!isEarned && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl backdrop-blur-[2px]">
                              <Lock className="w-6 h-6 text-gray-600" />
                            </div>
                          )}
                          <div className="absolute top-full left-0 right-0 mt-2 bg-black/80 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            <p className="font-semibold">{badge.name}</p>
                            <p className="text-gray-300">{badge.description}</p>
                            {isEarned && <p className="text-green-400 mt-1">✓ Earned</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Table-based Badges (admin-defined) */}
            {tableCategories.map(category => {
              const categoryBadges = badges.filter(b => b.category === category);
              const CategoryIcon = categoryIcons[category] || Trophy;
              const earnedCount = categoryBadges.filter(b => b.earned).length;

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="w-5 h-5 text-gray-700" />
                      <h3 className="font-bold text-gray-800 capitalize">{category}</h3>
                    </div>
                    <Badge variant="secondary">{earnedCount}/{categoryBadges.length}</Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {categoryBadges.map(badge => {
                      const progress = Math.min(100, (userPoints / badge.points_required) * 100);
                      
                      return (
                        <div key={badge.id} className="relative group">
                          <div className={`p-4 rounded-xl border-2 transition-all ${
                            badge.earned
                              ? `bg-linear-to-br ${colorClasses[badge.color] || 'from-gray-400 to-gray-500'} border-white shadow-lg scale-105`
                              : 'bg-gray-100 border-gray-300 opacity-60'
                          }`}>
                            <div className="text-center space-y-2">
                              <div className={`text-4xl ${badge.earned ? '' : 'grayscale'}`}>
                                {badge.icon}
                              </div>
                              <p className={`text-xs font-bold ${badge.earned ? 'text-white' : 'text-gray-600'}`}>
                                {badge.name}
                              </p>
                              {!badge.earned && (
                                <div className="space-y-1">
                                  <Progress value={progress} className="h-1" />
                                  <p className="text-[10px] text-gray-500">
                                    {badge.points_required} pts
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {!badge.earned && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl backdrop-blur-[2px]">
                              <Lock className="w-6 h-6 text-gray-600" />
                            </div>
                          )}
                          
                          <div className="absolute top-full left-0 right-0 mt-2 bg-black/80 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                            <p className="font-semibold">{badge.name}</p>
                            <p className="text-gray-300">{badge.description}</p>
                            {badge.earned && badge.earned_at && (
                              <p className="text-green-400 mt-1">
                                ✓ Earned {new Date(badge.earned_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {badges.length === 0 && Object.keys(dynamicCategories).length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <Trophy className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Start practicing to earn badges!</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BadgesShowcase;

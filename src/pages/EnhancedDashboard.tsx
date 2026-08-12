import safeLocalStorage from '@/utils/safeStorage';
// src/pages/EnhancedDashboard.tsx
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatExamDisplay } from '@/utils/examDisplay';
import {
  Trophy,
  Target,
  Calendar,
  TrendingUp,
  BookOpen,
  Flame,
  AlertCircle,
  X,
  Sparkles,
  Rocket,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import LoadingScreen from "@/components/ui/LoadingScreen";

import Leaderboard from "@/components/Leaderboard";

import { useUserStats } from "@/hooks/useUserStats";
import { useStreakData } from "@/hooks/useStreakData";
import { useExamDates } from "@/hooks/useExamDates";
import { getDaysUntilDate, getExamDateForGrade } from "@/utils/examTimeline";
import PointsService from "@/services/pointsService";
import { logger } from "@/utils/logger";
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

const EnhancedDashboard = () => {
  const { user, isPremium, isProPlus } = useAuth();
  const navigate = useNavigate();
  const { stats, profile, loading: userStatsLoading, refresh: refreshStats } = useUserStats();
  const { streak, loading: streakLoading } = useStreakData();
  const isLoading = userStatsLoading || streakLoading;
  const { getExamDate } = useExamDates();
  const [showBanner, setShowBanner] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => {
    const lastShown = safeLocalStorage.getItem("welcomeLastShown");
    const today = new Date().toDateString();
    return lastShown !== today;
  });
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<"overview" | "leaderboard">("overview");
  const mobileSwipeRef = useRef<HTMLDivElement | null>(null);
  const [pointsLevel, setPointsLevel] = useState({ name: 'BEGINNER', pointsToNext: 0, nextLevel: 'LEARNER' });
  const studyNowEnabled = useFeatureFlag('study_now');
  const testsEnabled = useFeatureFlag('test_mode');
  const analyticsEnabled = useFeatureFlag('analytics');
  const snapshotEnabled = useFeatureFlag('snapshot');
  const testHistoryEnabled = useFeatureFlag('test_history');
  const leaderboardEnabled = useFeatureFlag('leaderboard');
  const battleEnabled = useFeatureFlag('battle_mode');
  

  useEffect(() => {
    setIsClient(true);
    setCurrentTime(new Date().getHours());
    refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    if (stats) setLeaderboardKey((prev) => prev + 1);
  }, [stats]);

  const switchMobilePanel = (panel: "overview" | "leaderboard") => {
    setMobilePanel(panel);
    const container = mobileSwipeRef.current;
    if (!container) return;
    const index = panel === "overview" ? 0 : 1;
    container.scrollTo({ left: container.clientWidth * index, behavior: "smooth" });
  };

  useEffect(() => {
    if (user?.id) {
      PointsService.getUserPoints(user.id).then((data) => {
        setPointsLevel({
          name: data.level,
          pointsToNext: data.levelInfo.pointsToNext,
          nextLevel: data.levelInfo.nextLevel
        });
      }).catch((err) => {
        logger.error('Failed to fetch user points:', err);
      });
    }
  }, [user?.id, stats?.totalPoints]);

  const displayName = (() => {
    const fullName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (fullName) return fullName.split(/\s+/)[0];

    const emailName = user?.email?.split("@")[0];
    if (emailName) {
      return emailName
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }

    return "Student";
  })();

  // Calculate subscription days remaining
  const getDaysRemaining = () => {
    if (!profile?.subscription_end_date) return null;
    const end = new Date(profile.subscription_end_date);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  };

  const daysRemaining = getDaysRemaining();
  const examDate = getExamDateForGrade(getExamDate(profile?.target_exam || 'JEE'), profile?.grade);
  const examDaysLeft = getDaysUntilDate(examDate);

  const getTimeBasedMessage = () => {
    if (currentTime === null) return { greeting: "Hello", message: "Loading...", icon: "👋", action: "Start" };
    if (currentTime >= 6 && currentTime < 12)
      return { greeting: "Good morning", message: "Start strong!", icon: "🌅", action: "Quick Warmup" };
    if (currentTime >= 12 && currentTime < 17)
      return { greeting: "Good afternoon", message: "Perfect time for focused practice!", icon: "☀️", action: "Start Practice" };
    if (currentTime >= 17 && currentTime < 21)
      return { greeting: "Good evening", message: "Golden study hours!", icon: "🌆", action: "Deep Focus" };
    return { greeting: "Burning midnight oil", message: "Review & revise.", icon: "🌙", action: "Quick Revision" };
  };

  const timeMessage = getTimeBasedMessage();

  const getSmartNotification = () => {
    if (!stats) return null;
    if (stats.todayAccuracy < 60 && stats.questionsToday >= 10)
      return { message: "Focus needed! Review mistakes.", color: "orange", icon: AlertCircle, route: "/analytics" };
    if (streak >= 7 && stats.questionsToday < 10)
      return { message: `🔥 Don't break your ${streak}-day streak!`, color: "orange", icon: Flame, route: "/study-now" };
    if (stats.todayProgress >= stats.todayGoal && stats.todayAccuracy >= 80)
      return { message: "🎉 Daily goal smashed!", color: "green", icon: Trophy, route: "/analytics" };
    if (stats.questionsToday >= 50 && stats.todayAccuracy >= 85)
      return { message: "🎉 Daily goal smashed!", color: "green", icon: Trophy, route: "/analytics" };
    if (stats.rankChange && stats.rankChange >= 3)
      return { message: `📈 Climbed ${stats.rankChange} ranks!`, color: "blue", icon: TrendingUp, route: "/analytics" };
    return null;
  };

  const notification = stats ? getSmartNotification() : null;

  useEffect(() => {
    if (!isClient || !user || !notification) return;
    const bannerKey = `notification_seen_${user.id}_${new Date().toDateString()}`;
    const seen = safeLocalStorage.getItem(bannerKey);
    if (!seen) setShowBanner(true);
  }, [user, notification, isClient]);

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return { bg: "bg-emerald-100/90 dark:bg-emerald-950/50", border: "border-emerald-600", iconBg: "bg-emerald-600", text: "text-emerald-800 dark:text-emerald-300" };
    if (accuracy >= 80) return { bg: "bg-green-50/80 dark:bg-green-950/50", border: "border-green-500", iconBg: "bg-green-500", text: "text-green-700 dark:text-green-300" };
    if (accuracy >= 70) return { bg: "bg-lime-50/80 dark:bg-lime-950/50", border: "border-lime-500", iconBg: "bg-lime-500", text: "text-lime-700 dark:text-lime-300" };
    if (accuracy >= 60) return { bg: "bg-yellow-50/80 dark:bg-yellow-950/50", border: "border-yellow-400", iconBg: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300" };
    if (accuracy >= 50) return { bg: "bg-orange-50/80 dark:bg-orange-950/50", border: "border-orange-400", iconBg: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" };
    return { bg: "bg-red-50/80 dark:bg-red-950/50", border: "border-red-500", iconBg: "bg-red-500", text: "text-red-700 dark:text-red-300" };
  };

  const getGoalColor = (progress: number, goal: number) => {
    const percentage = (progress / goal) * 100;
    if (percentage >= 100) return { bg: "bg-emerald-100/90 dark:bg-emerald-950/50", border: "border-emerald-600", iconBg: "bg-emerald-600", text: "text-emerald-800 dark:text-emerald-300" };
    if (percentage >= 80) return { bg: "bg-green-50/80 dark:bg-green-950/50", border: "border-green-400", iconBg: "bg-green-500", text: "text-green-700 dark:text-green-300" };
    if (percentage >= 50) return { bg: "bg-yellow-50/80 dark:bg-yellow-950/50", border: "border-yellow-400", iconBg: "bg-yellow-500", text: "text-yellow-700 dark:text-yellow-300" };
    return { bg: "bg-red-50/80 dark:bg-red-950/50", border: "border-red-400", iconBg: "bg-red-500", text: "text-red-700 dark:text-red-300" };
  };

  const getStreakColor = (streak: number) => {
    if (streak >= 30) return { bg: "bg-purple-50/80 dark:bg-purple-950/50", border: "border-purple-400", iconBg: "bg-purple-500", text: "text-purple-700 dark:text-purple-300" };
    if (streak >= 7) return { bg: "bg-orange-50/80 dark:bg-orange-950/50", border: "border-orange-400", iconBg: "bg-orange-500", text: "text-orange-700 dark:text-orange-300" };
    return { bg: "bg-muted/50", border: "border-muted-foreground/30", iconBg: "bg-muted-foreground", text: "text-foreground" };
  };

  const getProgressBadge = (accuracy: number) => {
    if (accuracy >= 95) return { text: "Perfect! 💎", color: "bg-linear-to-r from-purple-600 to-pink-600" };
    if (accuracy >= 90) return { text: "Mastered! 🌟", color: "bg-linear-to-r from-purple-500 to-pink-500" };
    if (accuracy >= 85) return { text: "Excellent! ⭐", color: "bg-linear-to-r from-blue-500 to-indigo-600" };
    if (accuracy >= 80) return { text: "Very Good! 👍", color: "bg-linear-to-r from-green-500 to-emerald-600" };
    if (accuracy >= 75) return { text: "Good Job! 📈", color: "bg-linear-to-r from-lime-500 to-green-600" };
    if (accuracy >= 65) return { text: "Making Progress 💪", color: "bg-yellow-500" };
    if (accuracy >= 55) return { text: "Need Practice 📚", color: "bg-orange-400" };
    return { text: "Focus Needed ⚠️", color: "bg-orange-500" };
  };

  if (isLoading) return <LoadingScreen pageName="Dashboard" />;

  const accuracyColors = getAccuracyColor(stats?.todayAccuracy ?? 0);
  const goalColors = getGoalColor(stats?.todayProgress ?? 0, stats?.todayGoal ?? 30);
  const streakColors = getStreakColor(stats?.streak ?? 0);

  return (
    <div className="mobile-app-shell bg-background">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-secondary rounded-full -translate-y-1/2 translate-x-1/3 opacity-40" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-secondary rounded-full translate-y-1/2 -translate-x-1/3 opacity-30" />
      </div>
      <Header />

      <div className="relative z-10 flex-1 min-h-0 overflow-hidden lg:overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="container mx-auto px-2 sm:px-4 lg:px-6 max-w-7xl py-2 sm:py-3 min-h-full flex flex-col">
            
            <div className="flex flex-col gap-2 sm:gap-3 h-full min-h-0">




              {/* Notification Banner */}
              {showBanner && notification && (
                <div className={`hidden lg:block rounded-2xl p-4 shadow-xl transition-all duration-300 cursor-pointer hover:shadow-2xl hover:scale-[1.01] border-2 border-white/10 ${
                  notification.color === "green" ? "bg-linear-to-r from-emerald-500 via-green-600 to-teal-700 text-white" :
                  notification.color === "orange" ? "bg-linear-to-r from-orange-500 via-red-600 to-rose-700 text-white" :
                  "bg-linear-to-r from-blue-600 via-indigo-700 to-violet-800 text-white"
                }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => notification.route && navigate(notification.route)}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && notification.route) navigate(notification.route); }}
                >
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg shrink-0">
                        <notification.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <p className="text-xs sm:text-sm font-semibold truncate">{notification.message}</p>
                      <span className="text-[10px] sm:text-xs font-medium opacity-80 hidden sm:inline">Tap to view →</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        safeLocalStorage.setItem(`notification_seen_${user?.id}_${new Date().toDateString()}`, "true");
                        setShowBanner(false);
                      }}
                      className="p-1 sm:p-1.5 hover:bg-white/20 rounded-lg transition-colors shrink-0"
                    >
                      <X className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Welcome & Focus Banner */}
              {showWelcome && (
                <div className="rounded-2xl sm:rounded-3xl p-5 sm:p-8 bg-linear-to-br from-slate-900 via-blue-900 to-indigo-950 text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-700"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
                  
                  <button
                    onClick={() => {
                      safeLocalStorage.setItem("welcomeLastShown", new Date().toDateString());
                      setShowWelcome(false);
                    }}
                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors z-20 p-2 hover:bg-white/10 rounded-full"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{timeMessage.icon}</span>
                          <span className="text-xs font-bold uppercase tracking-widest text-blue-400">{timeMessage.greeting}</span>
                        </div>
                        <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
                          Namaste, {displayName}!<br />
                          <span className="text-blue-400">Ready to crush it?</span>
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {examDaysLeft !== null && (
                            <Badge className="bg-white/10 text-white border-white/20 hover:bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider">
                              {formatExamDisplay(profile?.target_exam)}: {examDaysLeft} Days Left
                            </Badge>
                          )}
                          <Badge className={`px-3 py-1 text-xs font-bold uppercase tracking-wider border-0 ${isPremium ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
                            {isProPlus ? 'Pro+' : isPremium ? 'Pro' : 'Free Plan'}
                          </Badge>
                          {daysRemaining && (
                            <span className="text-xs font-medium text-slate-400 ml-1">
                              {daysRemaining} days of Pro left
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        {studyNowEnabled && (
                          <Button 
                            size="lg"
                            onClick={() => navigate("/study-now")} 
                            className="bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] transition-all h-14 px-8 rounded-xl font-black uppercase tracking-widest group"
                          >
                            <BookOpen className="h-5 w-5 mr-3 group-hover:rotate-6 transition-transform" />
                            {timeMessage.action}
                          </Button>
                        )}
                        {testsEnabled && (
                          <Button 
                            size="lg"
                            onClick={() => navigate("/tests")} 
                            variant="outline"
                            className="bg-white/5 hover:bg-white/10 text-white border-white/20 hover:border-white/40 h-14 px-8 rounded-xl font-black uppercase tracking-widest"
                          >
                            <Target className="h-5 w-5 mr-3" />
                            Take Test
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="lg:hidden flex-1 min-h-0 flex flex-col gap-2 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">Dashboard</p>
                  </div>
                  {leaderboardEnabled ? (
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 text-xs font-semibold shadow-xs border border-border/60">
                      <button
                        type="button"
                        onClick={() => switchMobilePanel("overview")}
                        className={`px-2.5 py-1 rounded-md transition-all ${mobilePanel === "overview" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"}`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => switchMobilePanel("leaderboard")}
                        className={`px-2.5 py-1 rounded-md transition-all ${mobilePanel === "leaderboard" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground"}`}
                      >
                        Leaderboard
                      </button>
                    </div>
                  ) : null}
                </div>

                <div
                  ref={mobileSwipeRef}
                  className="flex flex-1 min-h-0 overflow-x-auto scrollbar-hide overscroll-x-contain scroll-smooth snap-x snap-mandatory touch-pan-x rounded-2xl border border-border bg-card/50"
                  onScroll={(e) => {
                    const target = e.currentTarget;
                    const nextPanel = target.scrollLeft > target.clientWidth / 2 ? "leaderboard" : "overview";
                    if (nextPanel !== mobilePanel) setMobilePanel(nextPanel);
                  }}
                >
                  <div className="w-full flex-none snap-start p-1 min-h-0">
                    <div className="h-full space-y-2 overflow-y-auto p-1">
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <Card className={`h-full rounded-2xl shadow-lg border-2 ${streakColors.border} ${streakColors.bg} relative overflow-hidden group`}> 
                          <CardContent className="p-4 h-full flex flex-col justify-between">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`p-2 ${streakColors.iconBg} rounded-xl shadow-md group-hover:scale-110 transition-transform`}>
                                <Flame className="h-4 w-4 text-white" />
                              </div>
                              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Streak</p>
                            </div>
                            <h3 className={`text-3xl font-black ${streakColors.text} tracking-tighter`}>{streak ?? 0} <span className="text-xs font-bold opacity-60">Days</span></h3>
                          </CardContent>
                        </Card>

                        <Card className={`h-full rounded-2xl shadow-lg border-2 ${goalColors.border} ${goalColors.bg} relative overflow-hidden group`}> 
                          <CardContent className="p-4 h-full flex flex-col justify-between">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`p-2 ${goalColors.iconBg} rounded-xl shadow-md group-hover:scale-110 transition-transform`}>
                                  <Calendar className="h-4 w-4 text-white" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Goal</p>
                              </div>
                            </div>
                            <h3 className={`text-3xl font-black ${goalColors.text} tracking-tighter`}>{stats?.todayProgress ?? 0}<span className="text-xs opacity-60">/{stats?.todayGoal ?? 30}</span></h3>
                            <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-2 mt-2">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, ((stats?.todayProgress ?? 0) / (stats?.todayGoal ?? 30)) * 100)}%` }}
                                className={`h-full rounded-full ${(stats?.todayProgress ?? 0) >= (stats?.todayGoal ?? 30) ? 'bg-emerald-500' : 'bg-orange-500'}`} 
                              />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="h-full rounded-2xl shadow-lg border-2 border-purple-200 bg-linear-to-br from-purple-50 via-white to-pink-50 dark:from-purple-900/20 dark:to-pink-950/20 relative overflow-hidden group col-span-2"> 
                          <CardContent className="p-4 h-full flex flex-col justify-between">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="p-2 bg-linear-to-r from-purple-600 to-pink-600 rounded-xl shadow-md group-hover:scale-110 transition-transform">
                                <Trophy className="h-4 w-4 text-white" />
                              </div>
                              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Mastery Points</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <h3 className="text-4xl font-black bg-linear-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent tracking-tighter">{stats?.totalPoints ?? 0}</h3>
                              <Badge className="text-[10px] font-black px-2 py-1 bg-linear-to-r from-purple-600 to-pink-600 text-white border-0">{pointsLevel.name}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="rounded-2xl shadow-lg border-2 border-slate-100 dark:border-slate-800 bg-card/95 overflow-hidden">
                        <CardHeader className="p-4 pb-2 border-b border-border/60">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <div className="p-2 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 text-white shadow-md">
                              <TrendingUp className="h-3 w-3" />
                            </div>
                            <span className="font-black uppercase tracking-widest text-xs">Mastery Levels</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                          {stats?.subjectStats ? (
                            <div className="space-y-4">
                              {Object.entries(stats.subjectStats).slice(0, 3).map(([subject, data]: any) => {
                                const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                                const isHigh = accuracy >= 80;
                                const isMid = accuracy >= 60;
                                
                                return (
                                  <div key={subject} className="space-y-1.5">
                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                      <span className="opacity-70">{subject}</span>
                                      <span className={isHigh ? 'text-emerald-500' : isMid ? 'text-amber-500' : 'text-red-500'}>{accuracy}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${accuracy}%` }}
                                        className={`h-full rounded-full ${isHigh ? 'bg-emerald-500' : isMid ? 'bg-amber-500' : 'bg-red-500'}`}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-muted-foreground opacity-50">
                              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-20" />
                              <p className="text-[10px] font-bold uppercase tracking-widest">No Practice Data</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {leaderboardEnabled && (
                    <div className="w-full flex-none snap-start p-1 min-h-0">
                      <div className="h-full rounded-2xl border border-border bg-card shadow-md overflow-hidden">
                        <Leaderboard key={leaderboardKey} compact />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Progress Analysis (Hidden on Mobile) */}
              <div className="hidden lg:flex flex-col gap-6 pt-4">
                <Card className="rounded-3xl border-2 border-slate-100 dark:border-slate-800 bg-card/95 shadow-2xl overflow-hidden flex flex-col">
                  <CardHeader className="p-6 border-b border-border/60">
                    <CardTitle className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-linear-to-br from-indigo-500 via-purple-600 to-violet-700 text-white rounded-2xl shadow-xl">
                          <TrendingUp className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-black uppercase tracking-widest text-foreground leading-none mb-1">Mastery Analysis</h3>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Real-time performance metrics</p>
                        </div>
                      </div>
                      <Badge className="bg-primary/10 text-primary text-xs font-black px-4 py-1.5 uppercase tracking-widest border-0">Global Stats</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {stats?.subjectStats && Object.keys(stats.subjectStats).length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.entries(stats.subjectStats).map(([subject, data]: any) => {
                          const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                          const isHigh = accuracy >= 80;
                          const isMid = accuracy >= 60;
                          
                          return (
                            <motion.div 
                              key={subject}
                              whileHover={{ y: -8, scale: 1.02 }}
                              className="bg-slate-50 dark:bg-slate-900/40 border-2 border-slate-100 dark:border-slate-800/50 rounded-3xl p-6 transition-all duration-300 shadow-lg hover:shadow-2xl group"
                            >
                              <div className="flex justify-between items-start mb-6">
                                <div className="space-y-1">
                                  <h4 className="font-black text-sm uppercase tracking-widest opacity-70 group-hover:opacity-100 transition-opacity">{subject}</h4>
                                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-tighter">Subject Proficiency</p>
                                </div>
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                                  isHigh ? 'bg-emerald-500/10 text-emerald-500' : 
                                  isMid ? 'bg-amber-500/10 text-amber-500' : 
                                  'bg-red-500/10 text-red-500'
                                }`}>
                                  {accuracy}%
                                </div>
                              </div>
                              
                              <div className="space-y-4">
                                <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-1 shadow-inner">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${accuracy}%` }}
                                    className={`h-full rounded-full shadow-lg ${
                                      isHigh ? 'bg-linear-to-r from-emerald-400 to-emerald-600' : 
                                      isMid ? 'bg-linear-to-r from-amber-400 to-amber-600' : 
                                      'bg-linear-to-r from-red-400 to-red-600'
                                    }`}
                                  />
                                </div>
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest opacity-60">
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className={`h-3 w-3 ${isHigh ? 'text-emerald-500' : 'text-slate-400'}`} />
                                    <span>{data.correct} Correct</span>
                                  </div>
                                  <span>{data.total} Total</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6 text-slate-300">
                          <BookOpen className="h-12 w-12 opacity-10" />
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-widest mb-2">Initialize Learning</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-8">Start your daily missions to unlock advanced mastery analytics and performance tracking.</p>
                        <Button 
                          size="lg"
                          onClick={() => navigate("/study-now")}
                          className="bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/20 px-10 h-14 rounded-2xl font-black uppercase tracking-widest"
                        >
                          Unlock Analytics →
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Main Content Area */}
              <div className="hidden lg:grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">

                {/* Mobile: Progress Section (Hidden on Desktop) */}
                <div className="lg:hidden flex flex-col min-h-0 pt-2 pb-6">
                  <Card className="rounded-3xl border-2 border-slate-100 dark:border-slate-800 bg-card shadow-xl overflow-hidden flex flex-col">
                    <CardHeader className="p-4 border-b border-border/60">
                      <CardTitle className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-linear-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-md">
                            <TrendingUp className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-black uppercase tracking-widest">Mastery</span>
                        </div>
                        <Badge className="bg-primary/10 text-primary text-[10px] font-black px-2 py-1 uppercase tracking-widest border-0">Weekly</Badge>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="p-4 flex-1">
                      {stats?.subjectStats && Object.keys(stats.subjectStats).length > 0 ? (
                        <div className="space-y-4">
                          {Object.entries(stats.subjectStats).map(([subject, data]: any) => {
                            const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                            const isHigh = accuracy >= 80;
                            const isMid = accuracy >= 60;

                            return (
                              <motion.div 
                                key={subject}
                                whileTap={{ scale: 0.98 }}
                                className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 transition-all duration-300"
                              >
                                <div className="flex justify-between items-center mb-3">
                                  <h4 className="font-black text-xs uppercase tracking-wider opacity-70">{subject}</h4>
                                  <span className={`text-lg font-black ${
                                    isHigh ? 'text-emerald-500' : 
                                    isMid ? 'text-amber-500' : 
                                    'text-red-500'
                                  }`}>{accuracy}%</span>
                                </div>
                                
                                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${accuracy}%` }}
                                    className={`h-full rounded-full ${
                                      isHigh ? 'bg-emerald-500' : 
                                      isMid ? 'bg-amber-500' : 
                                      'bg-red-500'
                                    }`}
                                  />
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <BookOpen className="h-8 w-8 opacity-10 mb-2" />
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Practice to see stats</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Leaderboard */}
                {leaderboardEnabled && (
                  <div className="hidden lg:flex min-h-0 flex-col">
                    <Leaderboard key={leaderboardKey} compact />
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;

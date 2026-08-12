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
} from "lucide-react";
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
  const { stats, profile, loading: isLoading, refresh: refreshStats } = useUserStats();
  const { streak } = useStreakData();
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
      return { message: "⭐ Outstanding performance!", color: "green", icon: Sparkles, route: "/analytics" };
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
                <div className={`hidden lg:block rounded-xl p-3 sm:p-3.5 shadow-lg transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-[1.01] ${
                  notification.color === "green" ? "bg-linear-to-r from-green-500 to-emerald-600 text-white" :
                  notification.color === "orange" ? "bg-linear-to-r from-orange-500 to-red-600 text-white" :
                  "bg-linear-to-r from-blue-500 to-indigo-600 text-white"
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

              {/* Welcome Banner — NO share button, days remaining integrated */}
              {showWelcome && (
                <div className="rounded-xl sm:rounded-2xl p-3 sm:p-6 bg-linear-to-br from-slate-900 via-blue-900 to-indigo-900 text-white shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 sm:w-64 sm:h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
                  <div className="absolute bottom-0 left-0 w-32 h-32 sm:w-48 sm:h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
                  
                  <button
                    onClick={() => {
                      safeLocalStorage.setItem("welcomeLastShown", new Date().toDateString());
                      setShowWelcome(false);
                    }}
                    className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 text-white/60 hover:text-white transition-colors z-10"
                  >
                    <X className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  <div className="relative z-10">
                    <div className="flex flex-col gap-3 sm:gap-4">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <h2 className="text-base sm:text-2xl font-bold mb-1 line-clamp-2">
                            {timeMessage.greeting}, {displayName}
                          </h2>
                          {daysRemaining && (
                            <p className="text-[11px] sm:text-base text-slate-200">
                              Pro active for {daysRemaining} more days
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {examDaysLeft !== null && (
                              <Badge className="text-[10px] bg-white/15 text-white border-white/20">
                                {formatExamDisplay(profile?.target_exam)}: {examDaysLeft} days left
                              </Badge>
                            )}
                            {isPremium ? (
                              <Badge className="text-[10px] bg-emerald-500/80 text-white border-0">
                                {isProPlus ? 'Pro+ Plan' : 'Pro Plan'}
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-amber-500/80 text-white border-0">
                                Free Plan
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="hidden sm:flex flex-wrap gap-2">
                        {studyNowEnabled && (
                          <Button 
                            size="sm"
                            onClick={() => navigate("/study-now")} 
                            className="bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all flex-1 sm:flex-none text-xs sm:text-sm"
                          >
                            <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            {timeMessage.action}
                          </Button>
                        )}
                        {testsEnabled && (
                          <Button 
                            size="sm"
                            onClick={() => navigate("/tests")} 
                            variant="outline"
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/40 shadow-lg transition-all flex-1 sm:flex-none text-xs sm:text-sm"
                          >
                            <Target className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Take Test
                          </Button>
                        )}
                        {isPremium && analyticsEnabled && (
                          <Button 
                            size="sm"
                            onClick={() => navigate("/analytics")} 
                            variant="outline"
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/40 shadow-lg transition-all flex-1 sm:flex-none text-xs sm:text-sm"
                          >
                            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Analytics
                          </Button>
                        )}
                        {snapshotEnabled && (
                          <Button 
                            size="sm"
                            onClick={() => navigate("/snapshot")} 
                            variant="outline"
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/40 shadow-lg transition-all flex-1 sm:flex-none text-xs sm:text-sm"
                          >
                            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Yearbook
                          </Button>
                        )}
                        {testHistoryEnabled && (
                          <Button 
                            size="sm"
                            onClick={() => navigate("/test-history")} 
                            variant="outline"
                            className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/40 shadow-lg transition-all flex-1 sm:flex-none text-xs sm:text-sm"
                          >
                            <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Test History
                          </Button>
                        )}
                        {isProPlus && battleEnabled && (
                          <Button
                            size="sm"
                            onClick={() => navigate("/battle")}
                            className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 hover:from-pink-700 hover:to-indigo-700 text-white shadow-lg transition-all flex-1 sm:flex-none text-xs sm:text-sm font-bold"
                          >
                            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Battle
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
                      <div className="grid grid-cols-2 gap-2 auto-rows-fr items-stretch">
                        <Card className={`h-full rounded-xl shadow-xs border-l-4 ${streakColors.border} ${streakColors.bg}`}> 
                          <CardContent className="p-2.5 h-full flex flex-col justify-between">
                            <div className="flex items-start gap-2 mb-1">
                              <div className={`p-1.5 ${streakColors.iconBg} rounded-lg shrink-0`}>
                                <Flame className="h-3 w-3 text-white" />
                              </div>
                              <p className="text-[11px] font-medium text-muted-foreground">Day Streak</p>
                            </div>
                            <h3 className={`text-xl font-bold ${streakColors.text}`}>{streak ?? 0}</h3>
                            <p className="text-[10px] text-muted-foreground mt-1">{streak > 0 ? 'Keep going!' : 'Start streak today'}</p>
                          </CardContent>
                        </Card>

                        <Card className={`h-full rounded-xl shadow-xs border-l-4 ${accuracyColors.border} ${accuracyColors.bg}`}> 
                          <CardContent className="p-2.5 h-full flex flex-col justify-between">
                            <div className="flex items-start gap-2 mb-1">
                              <div className={`p-1.5 ${accuracyColors.iconBg} rounded-lg shrink-0`}>
                                <Target className="h-3 w-3 text-white" />
                              </div>
                              <p className="text-[11px] font-medium text-muted-foreground">Today's Accuracy</p>
                            </div>
                            <h3 className={`text-xl font-bold ${accuracyColors.text}`}>{stats?.todayAccuracy ?? 0}%</h3>
                            <p className="text-[10px] text-muted-foreground mt-1">Overall: {stats?.accuracy ?? 0}%</p>
                          </CardContent>
                        </Card>
                      </div>

                      <div className="grid grid-cols-2 gap-2 auto-rows-fr items-stretch">
                        <Card className={`h-full rounded-xl shadow-xs border-l-4 ${goalColors.border} ${goalColors.bg}`}> 
                          <CardContent className="p-2.5 h-full flex flex-col justify-between">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <div className={`p-1.5 ${goalColors.iconBg} rounded-lg shrink-0`}>
                                  <Calendar className="h-3 w-3 text-white" />
                                </div>
                                <p className="text-[11px] font-medium text-muted-foreground">Today's Goal</p>
                              </div>
                              <Badge className="text-[10px] px-2 py-0.5 bg-white/70 text-foreground border-0">
                                {(stats?.todayProgress ?? 0) >= (stats?.todayGoal ?? 30) ? 'Done' : 'Go'}
                              </Badge>
                            </div>
                            <h3 className={`text-xl font-bold ${goalColors.text}`}>{stats?.todayProgress ?? 0}/{stats?.todayGoal ?? 30}</h3>
                            <div className="w-full bg-muted rounded-full h-2 mt-2 mb-1.5">
                              <div className={`h-2 rounded-full ${(stats?.todayProgress ?? 0) >= (stats?.todayGoal ?? 30) ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(100, ((stats?.todayProgress ?? 0) / (stats?.todayGoal ?? 30)) * 100)}%` }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {(stats?.todayGoal ?? 30) - (stats?.todayProgress ?? 0) > 0
                                ? `${(stats?.todayGoal ?? 30) - (stats?.todayProgress ?? 0)} questions left`
                                : 'Goal achieved!'}
                            </p>
                          </CardContent>
                        </Card>

                        <Card className="h-full rounded-xl shadow-xs border-l-4 border-purple-500 bg-linear-to-br from-purple-50/80 via-pink-50/80 to-indigo-50/80"> 
                          <CardContent className="p-2.5 h-full flex flex-col justify-between">
                            <div className="flex items-start gap-2 mb-1">
                              <div className="p-1.5 bg-linear-to-r from-purple-600 to-pink-600 rounded-lg shrink-0">
                                <Trophy className="h-3 w-3 text-white" />
                              </div>
                              <p className="text-[11px] font-medium text-muted-foreground">JEEnie Points</p>
                            </div>
                            <h3 className="text-xl font-bold bg-linear-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{stats?.totalPoints ?? 0}</h3>
                            <div className="flex items-center gap-2 mt-1.5">
                              <Badge className="text-[10px] font-bold px-2 py-0.5 bg-linear-to-r from-purple-600 to-pink-600 text-white">{pointsLevel.name}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="rounded-xl shadow-xs border border-border bg-card/95 overflow-hidden">
                        <CardHeader className="p-3 pb-2 border-b border-border/60">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <div className="p-1.5 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 text-white">
                              <TrendingUp className="h-3 w-3" />
                            </div>
                            <span className="font-bold text-foreground">Your Progress</span>
                            <Badge className="ml-auto text-[10px] bg-primary/10 text-primary border-0">This Week</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3">
                          {stats?.subjectStats ? (
                            <div className="grid grid-cols-3 gap-2">
                              {Object.entries(stats.subjectStats).slice(0, 3).map(([subject, data]: any) => {
                                const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                                const circumference = 2 * Math.PI * 32;
                                const strokeDashoffset = circumference - (accuracy / 100) * circumference;
                                const strokeColor = accuracy >= 80 ? '#10b981' : accuracy >= 60 ? '#f59e0b' : '#ef4444';
                                const bgColor = accuracy >= 80 ? '#d1fae5' : accuracy >= 60 ? '#fef3c7' : '#fee2e2';

                                return (
                                  <div key={subject} className="flex flex-col items-center gap-1">
                                    <div className="relative w-20 h-20">
                                      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                                        <circle cx="40" cy="40" r="32" fill="none" stroke={bgColor} strokeWidth="6" />
                                        <circle
                                          cx="40"
                                          cy="40"
                                          r="32"
                                          fill="none"
                                          stroke={strokeColor}
                                          strokeWidth="6"
                                          strokeLinecap="round"
                                          strokeDasharray={circumference}
                                          strokeDashoffset={strokeDashoffset}
                                          className="transition-all duration-700"
                                        />
                                      </svg>
                                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-sm font-bold" style={{ color: strokeColor }}>{accuracy}%</span>
                                        <span className="text-[8px] text-muted-foreground">{data.correct}/{data.total}</span>
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-semibold text-muted-foreground text-center leading-tight">
                                      {subject}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              <BookOpen className="h-6 w-6 mx-auto mb-2 opacity-40" />
                              <p className="text-xs font-medium">Start practicing to see progress</p>
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

              {/* 4 Dynamic Stats Cards */}
              <div className="hidden lg:grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2 md:gap-3 shrink-0 auto-rows-fr items-stretch">
                
                {/* 1st Card: Day Streak */}
                <Card className={`rounded-lg sm:rounded-xl shadow-xs hover:shadow-md transition-all border-l-4 ${streakColors.border} ${streakColors.bg} backdrop-blur-xs`}> 
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <div className={`p-1.5 sm:p-2 ${streakColors.iconBg} rounded-lg shrink-0 animate-pulse`}>
                        <Flame className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">Day Streak</p>
                    </div>
                    <h3 className={`text-2xl sm:text-3xl font-bold ${streakColors.text}`}>
                      {streak ?? 0}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {streak > 0 ? 'Keep going!' : 'Start your streak today!'}
                    </p>
                  </CardContent>
                </Card>

                {/* 2nd Card: Today's Accuracy */}
                <Card className={`rounded-lg sm:rounded-xl shadow-xs hover:shadow-md transition-all border-l-4 ${accuracyColors.border} ${accuracyColors.bg} backdrop-blur-xs`}> 
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 sm:p-2 ${accuracyColors.iconBg} rounded-lg shrink-0`}>
                          <Target className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">Today's Accuracy</p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between mb-2">
                      <h3 className={`text-2xl sm:text-3xl font-bold ${accuracyColors.text}`}>
                        {stats?.todayAccuracy ?? 0}%
                      </h3>
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1">
                        {stats?.accuracyChange == null ? (
                          <span className="hidden sm:inline text-xs text-muted-foreground font-semibold">— new</span>
                        ) : stats.accuracyChange > 0 ? (
                          <span className="hidden sm:inline text-xs text-green-600 dark:text-green-400 font-semibold">↑ {Math.abs(stats.accuracyChange)}% week</span>
                        ) : stats.accuracyChange < 0 ? (
                          <span className="hidden sm:inline text-xs text-red-600 dark:text-red-400 font-semibold">↓ {Math.abs(stats.accuracyChange)}% week</span>
                        ) : (
                          <span className="hidden sm:inline text-xs text-muted-foreground font-semibold">→ same as last week</span>
                        )}
                        <Badge className={`text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 ${
                          (stats?.todayAccuracy ?? 0) >= 80 ? 'bg-emerald-500 text-white' :
                          (stats?.todayAccuracy ?? 0) >= 60 ? 'bg-orange-500 text-white' :
                          'bg-red-500 text-white'
                        }`}>
                          {(stats?.todayAccuracy ?? 0) >= 80 ? 'Great!' : (stats?.todayAccuracy ?? 0) >= 60 ? 'Focus!' : 'Practice!'}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Overall: {stats?.accuracy ?? 0}%
                    </p>
                  </CardContent>
                </Card>

                {/* 3rd Card: Today's Goal */}
                <Card className={`rounded-lg sm:rounded-xl shadow-xs hover:shadow-md transition-all border-l-4 ${goalColors.border} ${goalColors.bg} backdrop-blur-xs`}> 
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 sm:p-2 ${goalColors.iconBg} rounded-lg shrink-0`}>
                          <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">Today's Goal</p>
                      </div>
                    </div>
                    <div className="flex items-end justify-between mb-2">
                      <h3 className={`text-2xl sm:text-3xl font-bold ${goalColors.text}`}>
                        {stats?.todayProgress ?? 0}/{stats?.todayGoal ?? 30}
                      </h3>
                      <Badge className={`text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 ${
                        (stats?.todayProgress ?? 0) >= (stats?.todayGoal ?? 30) ? 'bg-emerald-500 text-white' :
                        (stats?.todayProgress ?? 0) >= ((stats?.todayGoal ?? 30) * 0.5) ? 'bg-yellow-500 text-white' :
                        'bg-orange-500 text-white'
                      }`}>
                        {(stats?.todayProgress ?? 0) >= (stats?.todayGoal ?? 30) ? '🔥 Done!' : 
                         (stats?.todayProgress ?? 0) >= ((stats?.todayGoal ?? 30) * 0.5) ? '💪 Push!' : 
                         '🎯 Go!'}
                      </Badge>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mb-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          (stats?.todayProgress ?? 0) >= (stats?.todayGoal ?? 30) ? 'bg-emerald-500' :
                          (stats?.todayProgress ?? 0) >= ((stats?.todayGoal ?? 30) * 0.5) ? 'bg-yellow-500' :
                          'bg-orange-500'
                        }`}
                        style={{ width: `${Math.min(100, ((stats?.todayProgress ?? 0) / (stats?.todayGoal ?? 30)) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {(stats?.todayGoal ?? 30) - (stats?.todayProgress ?? 0) > 0 
                        ? `${(stats?.todayGoal ?? 30) - (stats?.todayProgress ?? 0)} questions left - Let's go! 🚀`
                        : `Goal achieved! 🎉`
                      }
                    </p>
                  </CardContent>
                </Card>

                {/* 4th Card: JEEnie Points */}
                <Card className="rounded-lg sm:rounded-xl shadow-xs hover:shadow-md transition-all border-l-4 border-purple-500 bg-linear-to-br from-purple-50/80 via-pink-50/80 to-indigo-50/80 dark:from-purple-950/50 dark:via-pink-950/50 dark:to-indigo-950/50 backdrop-blur-xs"> 
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <div className="p-1.5 sm:p-2 bg-linear-to-r from-purple-600 to-pink-600 rounded-lg shrink-0">
                        <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">JEEnie Points</p>
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold bg-linear-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      {stats?.totalPoints ?? 0}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="text-xs font-bold px-2 py-0.5 bg-linear-to-r from-purple-600 to-pink-600 text-white">
                        {pointsLevel.name}
                      </Badge>
                      <Sparkles className="h-3 w-3 text-pink-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Main Content Area */}
              <div className="hidden lg:grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">

                {/* Progress Section */}
                <div className="lg:col-span-2 min-h-0 flex flex-col">
                  <Card className="rounded-xl shadow-md border border-border bg-card flex-1 min-h-0 flex flex-col">
                    <CardHeader className="p-3 sm:p-4 border-b border-border">
                      <CardTitle className="flex justify-between items-center">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="p-2 bg-linear-to-br from-indigo-500 to-purple-600 text-white rounded-lg shadow-md">
                            <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <span className="text-sm sm:text-base font-bold text-foreground">Your Progress</span>
                        </div>
                        <Badge className="bg-primary/10 text-primary text-xs font-semibold px-2 sm:px-3">This Week</Badge>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="p-3 sm:p-4 flex-1 min-h-0 overflow-auto">

                      {stats?.subjectStats ? (
                        <>
                          {/* Mobile: Circular progress rings */}
                          <div className="grid grid-cols-3 gap-2 sm:hidden">
                            {Object.entries(stats.subjectStats).map(([subject, data]: any) => {
                              const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                              const circumference = 2 * Math.PI * 32;
                              const strokeDashoffset = circumference - (accuracy / 100) * circumference;
                              const strokeColor = accuracy >= 80 ? '#10b981' : accuracy >= 60 ? '#f59e0b' : '#ef4444';
                              const bgColor = accuracy >= 80 ? '#d1fae5' : accuracy >= 60 ? '#fef3c7' : '#fee2e2';

                              return (
                                <div key={subject} className="flex flex-col items-center gap-1">
                                  <div className="relative w-20 h-20">
                                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                                      <circle cx="40" cy="40" r="32" fill="none" stroke={bgColor} strokeWidth="6" />
                                      <circle cx="40" cy="40" r="32" fill="none" stroke={strokeColor} strokeWidth="6"
                                        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                                        className="transition-all duration-700" />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                      <span className="text-sm font-bold" style={{ color: strokeColor }}>{accuracy}%</span>
                                      <span className="text-[8px] text-muted-foreground">{data.correct}/{data.total}</span>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-semibold text-muted-foreground text-center leading-tight">{subject}</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Desktop: Card layout */}
                              <div className="hidden sm:grid sm:grid-cols-1 gap-3">
                            {Object.entries(stats.subjectStats).map(([subject, data]: any) => {
                              const accuracy = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                              const badge = getProgressBadge(accuracy);

                              return (
                                <div key={subject} className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-xs hover:shadow-lg transition-all duration-300 hover:scale-[1.02]">
                                  <div className="flex justify-between items-start mb-2 sm:mb-3">
                                    <div>
                                      <h4 className="text-xs sm:text-sm font-bold text-foreground mb-1">{subject}</h4>
                                      <Badge className={`${badge.color} text-white text-xs font-medium`}>
                                        {badge.text}
                                      </Badge>
                                    </div>
                                    <div className="text-right">
                                      <h3 className={`text-xl sm:text-2xl font-bold ${
                                        accuracy >= 90 ? 'text-emerald-600' :
                                        accuracy >= 80 ? 'text-green-600' :
                                        accuracy >= 70 ? 'text-yellow-600' :
                                        accuracy >= 60 ? 'text-orange-500' :
                                        'text-red-500'
                                      }`}>{accuracy}%</h3>
                                      <p className="text-xs text-muted-foreground">{data.correct}/{data.total}</p>
                                    </div>
                                  </div>
                                  <Progress 
                                    className={`h-2 sm:h-2.5 rounded-full ${
                                      accuracy >= 90 ? 'bg-emerald-100 dark:bg-emerald-950' :
                                      accuracy >= 80 ? 'bg-green-100 dark:bg-green-950' :
                                      accuracy >= 70 ? 'bg-yellow-100 dark:bg-yellow-950' :
                                      accuracy >= 60 ? 'bg-orange-100 dark:bg-orange-950' :
                                      'bg-red-100 dark:bg-red-950'
                                    }`} 
                                    value={accuracy} 
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          <p className="text-xs sm:text-sm font-medium">Start practicing to see progress</p>
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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, TrendingUp, Target, Clock, Trophy,
  AlertTriangle, CheckCircle2, Circle, Flame, Brain,
  Zap, BookOpen, ArrowRight, CalendarDays, Crosshair,
  TrendingDown, Award, ChevronDown, ChevronRight
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Area, AreaChart, ComposedChart, Legend
} from "recharts";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import { parseGrade } from "@/utils/gradeParser";
import { normalizeProgram, mapProgramToExamField } from "@/utils/programConfig";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, subMonths, isAfter, isSameDay, parseISO } from "date-fns";
import LoadingScreen from '@/components/ui/LoadingScreen';
import RoastMemeCard from '@/components/RoastMemeCard';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

// ─── Types ───────────────────────────────────────────────────────────
interface AttemptRow {
  time_spent: number;
  is_correct: boolean;
  created_at: string;
  questions: {
    subject: string;
    chapter: string | null;
    topic: string | null;
    difficulty: string | null;
    exam: string | null;
  };
}

interface TopicAnalysis {
  subject: string;
  chapter: string;
  topic: string;
  total: number;
  correct: number;
  accuracy: number;
  lastPracticed: string;
  daysSince: number;
  status: "mastered" | "in_progress" | "weak" | "not_started";
}

interface DailyData {
  date: string;
  label: string;
  questions: number;
  correct: number;
  accuracy: number;
  timeMin: number;
}

interface SubjectStat {
  total: number;
  correct: number;
  accuracy: number;
  chaptersCount: number;
  topicsCount: number;
  easy: { total: number; correct: number };
  medium: { total: number; correct: number };
  hard: { total: number; correct: number };
  chapters: Record<string, ChapterStat>;
}

interface ChapterStat {
  total: number;
  correct: number;
  accuracy: number;
  topics: Record<string, {
    total: number;
    correct: number;
    accuracy: number;
    lastPracticed: string;
    daysSince: number;
    status: string;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────
const buildDailyMap = (attempts: AttemptRow[], days: number): DailyData[] => {
  const map: Record<string, { q: number; c: number; t: number }> = {};
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = format(subDays(today, i), "yyyy-MM-dd");
    map[d] = { q: 0, c: 0, t: 0 };
  }
  attempts.forEach((a) => {
    const d = format(parseISO(a.created_at), "yyyy-MM-dd");
    if (map[d]) {
      map[d].q++;
      if (a.is_correct) map[d].c++;
      map[d].t += a.time_spent || 0;
    }
  });
  return Object.entries(map).map(([date, v]) => ({
    date,
    label: format(parseISO(date), "dd MMM"),
    questions: v.q,
    correct: v.c,
    accuracy: v.q > 0 ? Math.round((v.c / v.q) * 100) : 0,
    timeMin: Math.round(v.t / 60),
  }));
};

const getWeekRange = (offset: number) => {
  const ref = subDays(new Date(), offset * 7);
  return { start: startOfWeek(ref, { weekStartsOn: 1 }), end: endOfWeek(ref, { weekStartsOn: 1 }) };
};

const filterByRange = (attempts: AttemptRow[], start: Date, end: Date) =>
  attempts.filter((a) => {
    const d = parseISO(a.created_at);
    return d >= start && d <= end;
  });

// ─── Main Component ─────────────────────────────────────────────────
const AnalyticsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const roastMemeEnabled = useFeatureFlag('roast_meme');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  // ─── Data Fetch ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      // Window: from start of last month → now. This covers both the
      // 30-day window we display AND the full "last month" comparison
      // (start-of-month to end-of-month) without dropping early-month days.
      const windowStart = startOfMonth(subMonths(new Date(), 1));
      const [{ data: prof }, { data: rawAttempts }] = await Promise.all([
        supabase.from("profiles").select("grade, target_exam, daily_goal, current_streak, longest_streak, total_points").eq("id", user.id).single(),
        supabase.from("question_attempts").select("time_spent, is_correct, created_at, question_id, mode").eq("user_id", user.id).eq("mode", "practice").gte("created_at", windowStart.toISOString()),
      ]);
      setProfile(prof);

      // Fetch question metadata from public view (no RLS restriction)
      const questionIds = [...new Set((rawAttempts || []).map((a: any) => a.question_id).filter(Boolean))];
      const questionMeta: Record<string, any> = {};
      if (questionIds.length > 0) {
        for (let i = 0; i < questionIds.length; i += 500) {
          const chunk = questionIds.slice(i, i + 500);
          const { data: qData } = await supabase.from("questions_public").select("id, subject, chapter, topic, difficulty, exam").in("id", chunk);
          (qData || []).forEach((q: any) => { questionMeta[q.id] = q; });
        }
      }

      // Do NOT strict-filter by exam — legacy/imported questions may have a
      // different exam tag, but the user genuinely attempted them. Strict
      // filtering caused dashboard mismatches (dashboard counted 34 practice
      // Qs while analytics showed 5).
      // If questions_public returned nothing (RLS / view issue), fall back to
      // raw attempts with empty metadata rather than blanking the whole page.
      const haveMeta = Object.keys(questionMeta).length > 0;
      const mergedAttempts = (rawAttempts || [])
        .filter((a: any) => !haveMeta || questionMeta[a.question_id])
        .map((a: any) => ({
          time_spent: a.time_spent || 0,
          is_correct: a.is_correct,
          created_at: a.created_at,
          questions: questionMeta[a.question_id] || { subject: "Unknown", chapter: null, topic: null, difficulty: "Medium", exam: null },
        })) as AttemptRow[];

      setAttempts(mergedAttempts);
    } catch (e) {
      logger.error("Analytics load error", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Computed Analytics ──────────────────────────────────────────
  const analytics = useMemo(() => {
    if (!attempts.length) return null;

    // Overview
    const total = attempts.length;
    const correct = attempts.filter((a) => a.is_correct).length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    const totalTimeSec = attempts.reduce((s, a) => s + (a.time_spent || 0), 0);

    // Subject stats
    const subjects: Record<string, SubjectStat> = {};
    const topicMap: Record<string, TopicAnalysis> = {};

    attempts.forEach((a) => {
      const { subject, chapter, topic, difficulty } = a.questions || {};
      if (!subject) return;

      if (!subjects[subject]) {
        subjects[subject] = { total: 0, correct: 0, accuracy: 0, chaptersCount: 0, topicsCount: 0, easy: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, hard: { total: 0, correct: 0 }, chapters: {} };
      }
      const s = subjects[subject];
      s.total++;
      if (a.is_correct) s.correct++;

      const diff = (difficulty?.toLowerCase() || "medium") as "easy" | "medium" | "hard";
      if (s[diff]) { s[diff].total++; if (a.is_correct) s[diff].correct++; }

      if (chapter) {
        if (!s.chapters[chapter]) s.chapters[chapter] = { total: 0, correct: 0, accuracy: 0, topics: {} };
        s.chapters[chapter].total++;
        if (a.is_correct) s.chapters[chapter].correct++;

        if (topic) {
          if (!s.chapters[chapter].topics[topic]) {
            s.chapters[chapter].topics[topic] = { total: 0, correct: 0, accuracy: 0, lastPracticed: a.created_at, daysSince: 0, status: "not_started" };
          }
          const t = s.chapters[chapter].topics[topic];
          t.total++;
          if (a.is_correct) t.correct++;
          if (a.created_at > t.lastPracticed) t.lastPracticed = a.created_at;
        }
      }

      // flat topic map for strength/weakness
      // Fallback: when the question has no topic but does have a chapter,
      // treat the chapter as the analysis unit so weak/strong areas still surface.
      const unitKey = topic || chapter || null;
      if (unitKey) {
        const tk = `${subject}||${chapter || ""}||${unitKey}`;
        if (!topicMap[tk]) {
          topicMap[tk] = { subject, chapter: chapter || "", topic: unitKey, total: 0, correct: 0, accuracy: 0, lastPracticed: a.created_at, daysSince: 0, status: "not_started" };
        }
        topicMap[tk].total++;
        if (a.is_correct) topicMap[tk].correct++;
        if (a.created_at > topicMap[tk].lastPracticed) topicMap[tk].lastPracticed = a.created_at;
      }
    });



    // Finalize
    const chaptersSet = new Set<string>();
    const topicsSet = new Set<string>();
    Object.values(subjects).forEach((s) => {
      s.accuracy = s.total > 0 ? (s.correct / s.total) * 100 : 0;
      Object.entries(s.chapters).forEach(([ch, cd]) => {
        chaptersSet.add(ch);
        cd.accuracy = cd.total > 0 ? (cd.correct / cd.total) * 100 : 0;
        Object.entries(cd.topics).forEach(([tp, td]) => {
          topicsSet.add(tp);
          td.accuracy = td.total > 0 ? (td.correct / td.total) * 100 : 0;
          td.daysSince = Math.floor((Date.now() - new Date(td.lastPracticed).getTime()) / 86400000);
          td.status = td.total >= 20 && td.accuracy >= 80 ? "mastered" : td.total >= 5 && td.accuracy < 60 ? "weak" : td.total > 0 ? "in_progress" : "not_started";
        });
      });
      s.chaptersCount = Object.keys(s.chapters).length;
      s.topicsCount = Object.values(s.chapters).reduce((n, c) => n + Object.keys(c.topics).length, 0);
    });

    // topics for SWOT
    const topicList = Object.values(topicMap).map((t) => {
      t.accuracy = t.total > 0 ? (t.correct / t.total) * 100 : 0;
      t.daysSince = Math.floor((Date.now() - new Date(t.lastPracticed).getTime()) / 86400000);
      t.status = t.total >= 20 && t.accuracy >= 80 ? "mastered" : t.total >= 5 && t.accuracy < 60 ? "weak" : t.total > 0 ? "in_progress" : "not_started";
      return t;
    });

    const strengths = topicList.filter((t) => t.accuracy >= 80 && t.total >= 10).sort((a, b) => b.accuracy - a.accuracy);
    const weaknesses = topicList.filter((t) => (t.accuracy < 60 && t.total >= 5) || t.daysSince > 7).sort((a, b) => a.accuracy - b.accuracy);
    const improving = topicList.filter((t) => t.accuracy >= 60 && t.accuracy < 80 && t.total >= 5).sort((a, b) => b.accuracy - a.accuracy);

    // Daily data
    const daily14 = buildDailyMap(attempts, 14);
    const daily7 = daily14.slice(-7);

    // Weekly comparison
    const thisWeek = getWeekRange(0);
    const lastWeek = getWeekRange(1);
    const twAttempts = filterByRange(attempts, thisWeek.start, thisWeek.end);
    const lwAttempts = filterByRange(attempts, lastWeek.start, lastWeek.end);
    const weekComp = {
      thisWeek: { q: twAttempts.length, c: twAttempts.filter((a) => a.is_correct).length, t: twAttempts.reduce((s, a) => s + (a.time_spent || 0), 0) },
      lastWeek: { q: lwAttempts.length, c: lwAttempts.filter((a) => a.is_correct).length, t: lwAttempts.reduce((s, a) => s + (a.time_spent || 0), 0) },
    };

    // Monthly targets
    const monthStart = startOfMonth(new Date());
    const monthAttempts = attempts.filter((a) => parseISO(a.created_at) >= monthStart);
    const lastMonthStart = startOfMonth(subMonths(new Date(), 1));
    const lastMonthEnd = subDays(monthStart, 1);
    const lastMonthAttempts = filterByRange(attempts, lastMonthStart, lastMonthEnd);
    const dailyGoal = profile?.daily_goal || 20;

    const monthTargets = {
      questionsTarget: dailyGoal * 30,
      questionsDone: monthAttempts.length,
      accuracyTarget: Math.min(100, Math.round(accuracy) + 5),
      accuracyCurrent: monthAttempts.length > 0 ? Math.round((monthAttempts.filter((a) => a.is_correct).length / monthAttempts.length) * 100) : 0,
      topicsMasteredTarget: Math.max(5, strengths.length + 3),
      topicsMastered: strengths.length,
      lastMonth: {
        questions: lastMonthAttempts.length,
        accuracy: lastMonthAttempts.length > 0 ? Math.round((lastMonthAttempts.filter((a) => a.is_correct).length / lastMonthAttempts.length) * 100) : 0,
      },
    };

    return {
      overview: { total, correct, accuracy, totalTimeSec, topicsAttempted: topicsSet.size, chaptersAttempted: chaptersSet.size },
      subjects,
      strengths,
      weaknesses,
      improving,
      daily7,
      daily14,
      weekComp,
      monthTargets,
      topicList,
    };
  }, [attempts, profile]);

  // ─── Status Badge ────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { icon: any; cls: string; label: string }> = {
      mastered: { icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200", label: "Mastered" },
      in_progress: { icon: TrendingUp, cls: "bg-amber-500/10 text-amber-700 border-amber-200", label: "In Progress" },
      weak: { icon: AlertTriangle, cls: "bg-red-500/10 text-red-700 border-red-200", label: "Weak" },
      not_started: { icon: Circle, cls: "bg-muted text-muted-foreground border-border", label: "Not Started" },
    };
    const cfg = map[status] || map.not_started;
    const Icon = cfg.icon;
    return <Badge variant="outline" className={`${cfg.cls} text-[10px] gap-1`}><Icon className="h-2.5 w-2.5" />{cfg.label}</Badge>;
  };

  // ─── Loading ─────────────────────────────────────────────────────
  if (loading) {
    return <LoadingScreen pageName="Analytics" message="Loading your progress insights..." />;
  }

  if (!analytics) {
    return (
      <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Brain className="h-16 w-16 text-muted-foreground/40 mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">No Data Yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">Start practicing to see your performance analytics here.</p>
            <Button onClick={() => navigate("/study-now")} className="mt-4">Start Practicing <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    );
  }

  const { overview, subjects, strengths, weaknesses, improving, daily7, daily14, weekComp, monthTargets } = analytics;

  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 min-h-0 overflow-y-auto py-4 sm:py-6">
        <div className="container mx-auto px-3 sm:px-4 max-w-6xl">

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full grid grid-cols-5 h-auto p-1 mb-5">
              <TabsTrigger value="overview" className="text-[10px] sm:text-xs px-1 py-2 data-[state=active]:shadow-xs">📊 Overview</TabsTrigger>
              <TabsTrigger value="swot" className="text-[10px] sm:text-xs px-1 py-2 data-[state=active]:shadow-xs">🎯 SWOT</TabsTrigger>
              <TabsTrigger value="weekly" className="text-[10px] sm:text-xs px-1 py-2 data-[state=active]:shadow-xs">📅 Weekly</TabsTrigger>
              <TabsTrigger value="monthly" className="text-[10px] sm:text-xs px-1 py-2 data-[state=active]:shadow-xs">🏆 Monthly</TabsTrigger>
              <TabsTrigger value="detailed" className="text-[10px] sm:text-xs px-1 py-2 data-[state=active]:shadow-xs">📚 Detailed</TabsTrigger>
            </TabsList>

            {/* ─── TAB 1: OVERVIEW ─────────────────────────────────── */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              {/* Hero Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
                {[
                  { label: "Questions", value: overview.total, icon: Brain, color: "text-blue-600" },
                  { label: "Accuracy", value: `${overview.accuracy.toFixed(0)}%`, icon: Target, color: "text-emerald-600" },
                  { label: "Streak", value: profile?.current_streak || 0, icon: Flame, color: "text-orange-600" },
                  { label: "Topics", value: overview.topicsAttempted, icon: BookOpen, color: "text-pink-600" },
                ].map((s) => (
                  <Card key={s.label} className="border-border/50">
                    <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center gap-1">
                      <s.icon className={`h-5 w-5 ${s.color}`} />
                      <p className="text-lg sm:text-2xl font-bold text-foreground">{s.value}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{s.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Accuracy + Questions Trend */}
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> 7-Day Accuracy & Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {daily7.every(d => d.questions === 0) ? (
                    <div className="h-48 sm:h-56 flex flex-col items-center justify-center text-center px-4">
                      <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-2" />
                      <p className="text-sm font-medium text-foreground">No activity in the last 7 days</p>
                      <p className="text-xs text-muted-foreground mt-1">Solve a few questions to see your trend.</p>
                    </div>
                  ) : (
                    <div className="h-48 sm:h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={daily7}>
                          <defs>
                            <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(213, 100%, 19%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(213, 100%, 19%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                          <YAxis yAxisId="acc" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} label={{ value: '%', position: 'insideLeft', offset: 10, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                          <YAxis yAxisId="q" orientation="right" allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} label={{ value: 'Qs', position: 'insideRight', offset: 10, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar yAxisId="q" dataKey="questions" name="Questions" fill="hsl(213, 50%, 70%)" radius={[4, 4, 0, 0]} barSize={18} />
                          <Area yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy %" stroke="hsl(213, 100%, 19%)" fill="url(#accGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(213, 100%, 19%)" }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Subject Comparison */}
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Subject Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <div className="h-48 sm:h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Object.entries(subjects).map(([name, d]) => ({ name, accuracy: Math.round(d.accuracy), questions: d.total }))} barSize={32}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
                          {Object.entries(subjects).map(([name, d], i) => (
                            <Cell key={name} fill={d.accuracy >= 80 ? "#10b981" : d.accuracy >= 60 ? "#f59e0b" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-auto py-3 flex-col gap-1 border-red-200 hover:bg-red-50 text-red-700" onClick={() => setActiveTab("swot")}>
                  <AlertTriangle className="h-5 w-5" />
                  <span className="text-xs font-medium">Fix Weak Topics</span>
                  <span className="text-[10px] text-muted-foreground">{weaknesses.length} topics need work</span>
                </Button>
                <Button variant="outline" className="h-auto py-3 flex-col gap-1 border-emerald-200 hover:bg-emerald-50 text-emerald-700" onClick={() => navigate("/study-now")}>
                  <Zap className="h-5 w-5" />
                  <span className="text-xs font-medium">Practice Now</span>
                  <span className="text-[10px] text-muted-foreground">Continue studying</span>
                </Button>
              </div>
            </TabsContent>

            {/* ─── TAB 2: STRENGTHS & WEAKNESSES ───────────────────── */}
            <TabsContent value="swot" className="space-y-4 mt-0">
              {/* Summary */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">Performance Summary</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Strong in <span className="text-emerald-600 font-semibold">{strengths.length}</span> topics,
                        need work on <span className="text-red-600 font-semibold">{weaknesses.length}</span> topics,
                        <span className="text-amber-600 font-semibold"> {improving.length}</span> improving
                      </p>
                    </div>
                    <Crosshair className="h-8 w-8 text-primary/40" />
                  </div>
                </CardContent>
              </Card>

              {/* Strengths */}
              <div>
                <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4" /> Strengths ({strengths.length})
                </h3>
                {strengths.length === 0 ? (
                  <Card className="border-dashed"><CardContent className="p-4 text-center text-xs text-muted-foreground">Keep practicing to build strengths!</CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {strengths.slice(0, 8).map((t) => (
                      <TopicCard key={`${t.subject}-${t.topic}`} topic={t} navigate={navigate} />
                    ))}
                  </div>
                )}
              </div>

              {/* Weaknesses */}
              <div>
                <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4" /> Weaknesses ({weaknesses.length})
                </h3>
                {weaknesses.length === 0 ? (
                  <Card className="border-dashed"><CardContent className="p-4 text-center text-xs text-muted-foreground">No weak topics found. Great job!</CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {weaknesses.slice(0, 8).map((t) => (
                      <TopicCard key={`${t.subject}-${t.topic}`} topic={t} navigate={navigate} isWeak />
                    ))}
                  </div>
                )}
              </div>

              {/* Roast meme for weakest topic — shareable */}
              {roastMemeEnabled && weaknesses.length > 0 && (
                <RoastMemeCard
                  weakestTopic={weaknesses[0].topic}
                  weakestAccuracy={Math.round(weaknesses[0].accuracy)}
                />
              )}

              {/* Improving */}
              {improving.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4" /> Improving ({improving.length})
                  </h3>
                  <div className="space-y-2">
                    {improving.slice(0, 5).map((t) => (
                      <TopicCard key={`${t.subject}-${t.topic}`} topic={t} navigate={navigate} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ─── TAB 3: WEEKLY PROGRESS ──────────────────────────── */}
            <TabsContent value="weekly" className="space-y-4 mt-0">
              {/* Week Comparison */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "Questions", tw: weekComp.thisWeek.q, lw: weekComp.lastWeek.q },
                  { label: "Accuracy", tw: weekComp.thisWeek.q > 0 ? Math.round((weekComp.thisWeek.c / weekComp.thisWeek.q) * 100) : 0, lw: weekComp.lastWeek.q > 0 ? Math.round((weekComp.lastWeek.c / weekComp.lastWeek.q) * 100) : 0, suffix: "%" },
                  { label: "Time", tw: Math.round(weekComp.thisWeek.t / 60), lw: Math.round(weekComp.lastWeek.t / 60), suffix: "m" },
                ].map((item) => {
                  const change = pctChange(item.tw, item.lw);
                  return (
                    <Card key={item.label}>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
                        <p className="text-xl sm:text-2xl font-bold text-foreground">{item.tw}{item.suffix || ""}</p>
                        <div className={`text-[10px] font-medium mt-1 flex items-center justify-center gap-0.5 ${change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {change >= 0 ? "+" : ""}{change}% vs last week
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Daily Activity Chart */}
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" /> Daily Activity (14 days)
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <div className="h-48 sm:h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={daily14}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={1} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="questions" radius={[4, 4, 0, 0]} fill="hsl(213, 100%, 19%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Daily Breakdown */}
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-semibold">Daily Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 text-muted-foreground font-medium">Date</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Qs</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">✓</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Acc%</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...daily14].reverse().slice(0, 7).map((d) => (
                          <tr key={d.date} className="border-b border-border/50">
                            <td className="py-2 font-medium text-foreground">{d.label}</td>
                            <td className="text-center text-foreground">{d.questions}</td>
                            <td className="text-center text-emerald-600">{d.correct}</td>
                            <td className="text-center">
                              <span className={d.accuracy >= 80 ? "text-emerald-600" : d.accuracy >= 60 ? "text-amber-600" : "text-red-600"}>
                                {d.accuracy}%
                              </span>
                            </td>
                            <td className="text-center text-muted-foreground">{d.timeMin}m</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Streak */}
              <Card className="bg-linear-to-r from-orange-500/10 to-red-500/10 border-orange-200">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Current Streak</p>
                    <p className="text-3xl font-bold text-orange-600">{profile?.current_streak || 0} <span className="text-lg">days</span></p>
                    <p className="text-[10px] text-muted-foreground">Longest: {profile?.longest_streak || 0} days</p>
                  </div>
                  <Flame className="h-12 w-12 text-orange-500/60" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── TAB 4: MONTHLY TARGETS ──────────────────────────── */}
            <TabsContent value="monthly" className="space-y-4 mt-0">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" /> {format(new Date(), "MMMM yyyy")} Targets
              </h3>

              {/* Targets */}
              {[
                { label: "Questions Solved", current: monthTargets.questionsDone, target: monthTargets.questionsTarget, icon: Brain, color: "bg-blue-500" },
                { label: "Monthly Accuracy", current: monthTargets.accuracyCurrent, target: monthTargets.accuracyTarget, icon: Target, color: "bg-emerald-500", suffix: "%" },
                { label: "Topics Mastered", current: monthTargets.topicsMastered, target: monthTargets.topicsMasteredTarget, icon: Award, color: "bg-purple-500" },
              ].map((item) => {
                const pct = Math.min(100, item.target > 0 ? (item.current / item.target) * 100 : 0);
                return (
                  <Card key={item.label}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center`}>
                            <item.icon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-foreground">{item.label}</p>
                            <p className="text-[10px] text-muted-foreground">Target: {item.target}{item.suffix || ""}</p>
                          </div>
                        </div>
                        <p className="text-xl font-bold text-foreground">{item.current}<span className="text-sm text-muted-foreground">/{item.target}{item.suffix || ""}</span></p>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <p className="text-[10px] text-muted-foreground mt-1 text-right">{Math.round(pct)}% complete</p>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Month vs Month */}
              <Card>
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-semibold">Month-over-Month</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground mb-1">This Month</p>
                      <p className="text-2xl font-bold text-foreground">{monthTargets.questionsDone}</p>
                      <p className="text-xs text-muted-foreground">questions</p>
                      <p className="text-lg font-semibold text-foreground mt-1">{monthTargets.accuracyCurrent}%</p>
                      <p className="text-[10px] text-muted-foreground">accuracy</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground mb-1">Last Month</p>
                      <p className="text-2xl font-bold text-foreground">{monthTargets.lastMonth.questions}</p>
                      <p className="text-xs text-muted-foreground">questions</p>
                      <p className="text-lg font-semibold text-foreground mt-1">{monthTargets.lastMonth.accuracy}%</p>
                      <p className="text-[10px] text-muted-foreground">accuracy</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── TAB 5: DETAILED DRILL-DOWN ──────────────────────── */}
            <TabsContent value="detailed" className="space-y-4 mt-0">
              {Object.entries(subjects).map(([subject, data]) => (
                <Card key={subject} className="overflow-hidden">
                  {/* Subject Header */}
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedSubjects((p) => ({ ...p, [subject]: !p[subject] }))}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
                        {subject[0]}
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-foreground">{subject}</h3>
                        <p className="text-[10px] text-muted-foreground">{data.chaptersCount} chapters • {data.topicsCount} topics • {data.total} questions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-bold ${data.accuracy >= 80 ? "text-emerald-600" : data.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
                        {data.accuracy.toFixed(0)}%
                      </span>
                      {expandedSubjects[subject] ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Chapters */}
                  {expandedSubjects[subject] && (
                    <div className="border-t border-border px-4 pb-4">
                      {/* Difficulty Breakdown */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-b border-border/50 mb-3">
                        {(["easy", "medium", "hard"] as const).map((diff) => (
                          <div key={diff} className="text-center">
                            <p className={`text-xs font-medium ${diff === "easy" ? "text-emerald-600" : diff === "medium" ? "text-amber-600" : "text-red-600"}`}>
                              {diff.charAt(0).toUpperCase() + diff.slice(1)}
                            </p>
                            <p className="text-sm font-bold text-foreground">
                              {data[diff].total > 0 ? Math.round((data[diff].correct / data[diff].total) * 100) : 0}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">{data[diff].total} qs</p>
                          </div>
                        ))}
                      </div>

                      {Object.entries(data.chapters).map(([chapter, cd]) => {
                        const chKey = `${subject}-${chapter}`;
                        return (
                          <div key={chapter} className="mb-2">
                            <button
                              className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                              onClick={() => setExpandedChapters((p) => ({ ...p, [chKey]: !p[chKey] }))}
                            >
                              <div className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-primary/60" />
                                <span className="text-sm font-medium text-foreground">{chapter}</span>
                                <span className="text-[10px] text-muted-foreground">({cd.total} qs)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${cd.accuracy >= 80 ? "text-emerald-600" : cd.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                  {cd.accuracy.toFixed(0)}%
                                </span>
                                {expandedChapters[chKey] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                              </div>
                            </button>

                            {expandedChapters[chKey] && (
                              <div className="ml-4 mt-2 space-y-1.5 border-l-2 border-primary/20 pl-3">
                                {Object.entries(cd.topics).map(([topic, td]) => (
                                  <div key={topic} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-xs font-medium text-foreground truncate">{topic}</span>
                                        <StatusBadge status={td.status} />
                                      </div>
                                      <p className="text-[10px] text-muted-foreground">{td.total} qs • {td.daysSince}d ago</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-bold ${td.accuracy >= 80 ? "text-emerald-600" : td.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                        {td.accuracy.toFixed(0)}%
                                      </span>
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => navigate("/study-now")}>
                                        Practice
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

// ─── Topic Card (for SWOT tab) ───────────────────────────────────────
const TopicCard = ({ topic, navigate, isWeak }: { topic: TopicAnalysis; navigate: any; isWeak?: boolean }) => (
  <Card className={`border ${isWeak ? "border-red-200/50" : "border-border/50"}`}>
    <CardContent className="p-3 flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-foreground truncate">{topic.topic}</span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{topic.subject} • {topic.chapter}</p>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
          <span>{topic.total} qs</span>
          <span>{topic.daysSince}d ago</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right">
          <p className={`text-lg font-bold ${topic.accuracy >= 80 ? "text-emerald-600" : topic.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
            {topic.accuracy.toFixed(0)}%
          </p>
        </div>
        <Button size="sm" variant={isWeak ? "destructive" : "outline"} className="h-7 px-2 text-[10px]" onClick={() => navigate("/study-now")}>
          {isWeak ? "Fix" : "Practice"}
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default AnalyticsPage;

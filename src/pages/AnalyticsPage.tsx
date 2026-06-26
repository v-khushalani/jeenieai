import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  BarChart3, TrendingUp, Target, Clock, Trophy,
  AlertTriangle, CheckCircle2, Circle, Flame, Sparkles,
  Zap, BookOpen, ArrowRight, CalendarDays, Crosshair,
  TrendingDown, Award, ChevronDown, ChevronRight, Layers
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Area, ComposedChart, Legend
} from "recharts";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/utils/logger";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, subMonths, parseISO } from "date-fns";
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
  date: string; label: string; questions: number; correct: number; accuracy: number; timeMin: number;
}

interface SubjectStat {
  total: number; correct: number; accuracy: number; chaptersCount: number; topicsCount: number;
  easy: { total: number; correct: number };
  medium: { total: number; correct: number };
  hard: { total: number; correct: number };
  chapters: Record<string, ChapterStat>;
}

interface ChapterStat {
  total: number; correct: number; accuracy: number;
  topics: Record<string, { total: number; correct: number; accuracy: number; lastPracticed: string; daysSince: number; status: string; }>;
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
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const windowStart = startOfMonth(subMonths(new Date(), 1));
      const [{ data: prof }, { data: rawAttempts }] = await Promise.all([
        supabase.from("profiles").select("grade, target_exam, daily_goal, current_streak, longest_streak, total_points").eq("id", user.id).single(),
        supabase.from("question_attempts").select("time_spent, is_correct, created_at, question_id, mode").eq("user_id", user.id).eq("mode", "practice").gte("created_at", windowStart.toISOString()),
      ]);
      setProfile(prof);

      const questionIds = [...new Set((rawAttempts || []).map((a: any) => a.question_id).filter(Boolean))];
      const questionMeta: Record<string, any> = {};
      if (questionIds.length > 0) {
        for (let i = 0; i < questionIds.length; i += 500) {
          const chunk = questionIds.slice(i, i + 500);
          const { data: qData } = await supabase.from("questions_public").select("id, subject, chapter, topic, difficulty, exam").in("id", chunk);
          (qData || []).forEach((q: any) => { questionMeta[q.id] = q; });
        }
      }
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

  const analytics = useMemo(() => {
    if (!attempts.length) return null;

    const total = attempts.length;
    const correct = attempts.filter((a) => a.is_correct).length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    const totalTimeSec = attempts.reduce((s, a) => s + (a.time_spent || 0), 0);

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

    const topicList = Object.values(topicMap).map((t) => {
      t.accuracy = t.total > 0 ? (t.correct / t.total) * 100 : 0;
      t.daysSince = Math.floor((Date.now() - new Date(t.lastPracticed).getTime()) / 86400000);
      t.status = t.total >= 20 && t.accuracy >= 80 ? "mastered" : t.total >= 5 && t.accuracy < 60 ? "weak" : t.total > 0 ? "in_progress" : "not_started";
      return t;
    });

    const strengths = topicList.filter((t) => t.accuracy >= 80 && t.total >= 10).sort((a, b) => b.accuracy - a.accuracy);
    const weaknesses = topicList.filter((t) => (t.accuracy < 60 && t.total >= 5) || t.daysSince > 7).sort((a, b) => a.accuracy - b.accuracy);
    const improving = topicList.filter((t) => t.accuracy >= 60 && t.accuracy < 80 && t.total >= 5).sort((a, b) => b.accuracy - a.accuracy);

    const daily7 = buildDailyMap(attempts, 7);
    const daily30 = buildDailyMap(attempts, 30);

    const thisWeek = getWeekRange(0);
    const lastWeek = getWeekRange(1);
    const twAttempts = filterByRange(attempts, thisWeek.start, thisWeek.end);
    const lwAttempts = filterByRange(attempts, lastWeek.start, lastWeek.end);
    const weekComp = {
      thisWeek: { q: twAttempts.length, c: twAttempts.filter((a) => a.is_correct).length },
      lastWeek: { q: lwAttempts.length, c: lwAttempts.filter((a) => a.is_correct).length },
    };

    return {
      overview: { total, correct, accuracy, totalTimeSec, topicsAttempted: topicsSet.size, chaptersAttempted: chaptersSet.size },
      subjects,
      strengths,
      weaknesses,
      improving,
      daily7,
      daily30,
      weekComp,
      topicList,
    };
  }, [attempts]);

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

  if (loading) {
    return <LoadingScreen pageName="Analytics" message="Loading your progress insights..." />;
  }

  if (!analytics) {
    return (
      <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Sparkles className="h-16 w-16 text-muted-foreground/40 mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">No Data Yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">Start practicing to see your performance analytics here.</p>
            <Button onClick={() => navigate("/study-now")} className="mt-4">Start Practicing <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    );
  }

  const { overview, subjects, strengths, weaknesses, improving, daily7, daily30, weekComp } = analytics;

  // Trends data per range
  const trendData = range === "7d" ? daily7 : daily30;
  const pctChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  // ─── KPI Strip ──────────────────────────────────────────────────
  const kpis = [
    { label: "Accuracy", value: `${overview.accuracy.toFixed(0)}%`, icon: Target, color: "text-emerald-600" },
    { label: "Questions", value: overview.total, icon: Sparkles, color: "text-blue-600" },
    { label: "Streak", value: profile?.current_streak || 0, icon: Flame, color: "text-orange-600" },
    { label: "Topics", value: overview.topicsAttempted, icon: BookOpen, color: "text-pink-600" },
    { label: "Points", value: profile?.total_points || 0, icon: Trophy, color: "text-amber-600" },
  ];

  const topStrength = strengths[0];
  const topWeakness = weaknesses[0];

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full container mx-auto px-3 sm:px-4 max-w-6xl py-3 flex flex-col gap-3 min-h-0">

          {/* KPI strip — single row, equal width */}
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2 shrink-0">
            {kpis.map((s) => (
              <Card key={s.label} className="border-border/50">
                <CardContent className="p-2 sm:p-2.5 flex flex-col items-center text-center gap-0.5">
                  <s.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${s.color}`} />
                  <p className="text-sm sm:text-lg font-bold text-foreground leading-none">{s.value}</p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-none truncate w-full">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs + range toggle */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <TabsList className="grid grid-cols-3 h-auto p-0.5">
                <TabsTrigger value="overview" className="text-xs px-3 py-1.5">📊 Overview</TabsTrigger>
                <TabsTrigger value="swot" className="text-xs px-3 py-1.5">🎯 SWOT</TabsTrigger>
                <TabsTrigger value="trends" className="text-xs px-3 py-1.5">📈 Trends</TabsTrigger>
              </TabsList>
              {activeTab === "trends" && (
                <div className="flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
                  {(["7d", "30d", "all"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRange(r)}
                      className={`text-[10px] px-2 py-0.5 rounded ${range === r ? "bg-background shadow-xs font-semibold text-foreground" : "text-muted-foreground"}`}
                    >
                      {r === "all" ? "All" : r}
                    </button>
                  ))}
                </div>
              )}
              <Sheet open={drillOpen} onOpenChange={setDrillOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-[10px] gap-1 h-7">
                    <Layers className="h-3 w-3" /> All topics
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>All Subjects & Topics</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4 space-y-3">
                    {Object.entries(subjects).map(([subject, data]) => (
                      <Card key={subject} className="overflow-hidden">
                        <button
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30"
                          onClick={() => setExpandedSubjects((p) => ({ ...p, [subject]: !p[subject] }))}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">
                              {subject[0]}
                            </div>
                            <div className="text-left">
                              <h3 className="font-semibold text-foreground text-sm">{subject}</h3>
                              <p className="text-[10px] text-muted-foreground">{data.chaptersCount} ch • {data.topicsCount} tp • {data.total} qs</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-base font-bold ${data.accuracy >= 80 ? "text-emerald-600" : data.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
                              {data.accuracy.toFixed(0)}%
                            </span>
                            {expandedSubjects[subject] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </div>
                        </button>
                        {expandedSubjects[subject] && (
                          <div className="border-t border-border px-3 pb-3 space-y-1.5 pt-2">
                            {Object.entries(data.chapters).map(([chapter, cd]) => (
                              <div key={chapter} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <BookOpen className="h-3 w-3 text-primary/60 shrink-0" />
                                  <span className="font-medium text-foreground truncate">{chapter}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">({cd.total})</span>
                                </div>
                                <span className={`text-sm font-bold ${cd.accuracy >= 80 ? "text-emerald-600" : cd.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                  {cd.accuracy.toFixed(0)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* ─── OVERVIEW TAB ─────────────────────────────────────── */}
            <TabsContent value="overview" className="flex-1 min-h-0 mt-3 grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Main chart */}
              <Card className="md:col-span-3 flex flex-col min-h-0">
                <CardHeader className="pb-1 px-3 pt-3 shrink-0">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" /> 7-Day Accuracy & Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 flex-1 min-h-0">
                  {daily7.every(d => d.questions === 0) ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4">
                      <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-2" />
                      <p className="text-sm font-medium text-foreground">No activity in the last 7 days</p>
                      <p className="text-xs text-muted-foreground mt-1">Solve a few questions to see your trend.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                      <ComposedChart data={daily7}>
                        <defs>
                          <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(213, 100%, 19%)" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(213, 100%, 19%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="acc" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis yAxisId="q" orientation="right" allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar yAxisId="q" dataKey="questions" name="Questions" fill="hsl(213, 50%, 70%)" radius={[4, 4, 0, 0]} barSize={16} />
                        <Area yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy %" stroke="hsl(213, 100%, 19%)" fill="url(#accGrad)" strokeWidth={2} dot={{ r: 3, fill: "hsl(213, 100%, 19%)" }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Right rail */}
              <div className="md:col-span-2 flex flex-col gap-3 min-h-0 overflow-hidden">
                {topStrength && (
                  <Card className="border-emerald-200/60 bg-emerald-50/40 shrink-0">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Top strength</p>
                        <p className="text-sm font-semibold text-foreground truncate">{topStrength.topic}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{topStrength.subject}</p>
                      </div>
                      <span className="text-xl font-bold text-emerald-600 shrink-0">{topStrength.accuracy.toFixed(0)}%</span>
                    </CardContent>
                  </Card>
                )}
                {topWeakness ? (
                  <Card className="border-red-200/60 bg-red-50/40 shrink-0">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] text-red-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Needs work</p>
                        <p className="text-sm font-semibold text-foreground truncate">{topWeakness.topic}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{topWeakness.subject}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xl font-bold text-red-600">{topWeakness.accuracy.toFixed(0)}%</span>
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-[10px]" onClick={() => navigate("/study-now")}>Fix</Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="shrink-0"><CardContent className="p-3 text-center text-xs text-muted-foreground">No weak topics — great work!</CardContent></Card>
                )}
                {roastMemeEnabled && topWeakness && (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <RoastMemeCard
                      weakestTopic={topWeakness.topic}
                      weakestAccuracy={Math.round(topWeakness.accuracy)}
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── SWOT TAB ─────────────────────────────────────────── */}
            <TabsContent value="swot" className="flex-1 min-h-0 mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-hidden">
              <Card className="border-emerald-200/60 flex flex-col min-h-0 overflow-hidden">
                <CardHeader className="pb-1 px-3 pt-3 shrink-0">
                  <CardTitle className="text-xs font-semibold text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Strengths ({strengths.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 flex-1 min-h-0 overflow-y-auto space-y-1.5">
                  {strengths.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-6">Keep practicing to build strengths!</p>
                  ) : strengths.slice(0, 6).map((t) => (
                    <TopicCard key={`s-${t.subject}-${t.topic}`} topic={t} navigate={navigate} />
                  ))}
                </CardContent>
              </Card>

              <Card className="border-red-200/60 flex flex-col min-h-0 overflow-hidden">
                <CardHeader className="pb-1 px-3 pt-3 shrink-0">
                  <CardTitle className="text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" /> Weaknesses ({weaknesses.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 flex-1 min-h-0 overflow-y-auto space-y-1.5">
                  {weaknesses.length === 0 ? (
                    <p className="text-xs text-center text-muted-foreground py-6">No weak topics found. 🔥</p>
                  ) : weaknesses.slice(0, 6).map((t) => (
                    <TopicCard key={`w-${t.subject}-${t.topic}`} topic={t} navigate={navigate} isWeak />
                  ))}
                </CardContent>
              </Card>

              {improving.length > 0 && (
                <Card className="border-amber-200/60 md:col-span-2 flex flex-col min-h-0 overflow-hidden">
                  <CardHeader className="pb-1 px-3 pt-3 shrink-0">
                    <CardTitle className="text-xs font-semibold text-amber-700 flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5" /> Improving ({improving.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-3 flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {improving.slice(0, 6).map((t) => (
                      <TopicCard key={`i-${t.subject}-${t.topic}`} topic={t} navigate={navigate} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── TRENDS TAB ───────────────────────────────────────── */}
            <TabsContent value="trends" className="flex-1 min-h-0 mt-3 grid grid-cols-1 md:grid-cols-5 gap-3 overflow-hidden">
              {/* Comparison strip */}
              <div className="md:col-span-5 grid grid-cols-3 gap-2 shrink-0">
                {[
                  { label: "Questions (wk)", tw: weekComp.thisWeek.q, lw: weekComp.lastWeek.q },
                  { label: "Accuracy (wk)", tw: weekComp.thisWeek.q > 0 ? Math.round((weekComp.thisWeek.c / weekComp.thisWeek.q) * 100) : 0, lw: weekComp.lastWeek.q > 0 ? Math.round((weekComp.lastWeek.c / weekComp.lastWeek.q) * 100) : 0, suffix: "%" },
                  { label: "Streak", tw: profile?.current_streak || 0, lw: profile?.longest_streak || 0, labelLw: "best" },
                ].map((item: any) => {
                  const change = pctChange(item.tw, item.lw);
                  return (
                    <Card key={item.label}>
                      <CardContent className="p-2 sm:p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="text-base sm:text-lg font-bold text-foreground">{item.tw}{item.suffix || ""}</p>
                        <div className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {item.labelLw ? <span className="text-muted-foreground">{item.labelLw}: {item.lw}</span> : (
                            <>
                              {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {change >= 0 ? "+" : ""}{change}%
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Trend line */}
              <Card className="md:col-span-3 flex flex-col min-h-0">
                <CardHeader className="pb-1 px-3 pt-3 shrink-0">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> Daily Activity ({range})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} interval={range === "30d" ? 3 : 0} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="questions" radius={[4, 4, 0, 0]} fill="hsl(213, 100%, 19%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Subject performance bars */}
              <Card className="md:col-span-2 flex flex-col min-h-0">
                <CardHeader className="pb-1 px-3 pt-3 shrink-0">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" /> Subject Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-3 flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                    <BarChart data={Object.entries(subjects).map(([name, d]) => ({ name, accuracy: Math.round(d.accuracy), questions: d.total }))} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="accuracy" radius={[6, 6, 0, 0]}>
                        {Object.entries(subjects).map(([name, d]) => (
                          <Cell key={name} fill={d.accuracy >= 80 ? "#10b981" : d.accuracy >= 60 ? "#f59e0b" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

        </div>
      </div>
    </div>
  );
};

// ─── Topic Card ───────────────────────────────────────────────────────
const TopicCard = ({ topic, navigate, isWeak }: { topic: TopicAnalysis; navigate: any; isWeak?: boolean }) => (
  <Card className={`border ${isWeak ? "border-red-200/50" : "border-border/50"}`}>
    <CardContent className="p-2.5 flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-foreground truncate block">{topic.topic}</span>
        <p className="text-[10px] text-muted-foreground truncate">{topic.subject}{topic.chapter ? ` • ${topic.chapter}` : ''}</p>
        <p className="text-[10px] text-muted-foreground">{topic.total} qs • {topic.daysSince}d ago</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <p className={`text-base font-bold ${topic.accuracy >= 80 ? "text-emerald-600" : topic.accuracy >= 60 ? "text-amber-600" : "text-red-600"}`}>
          {topic.accuracy.toFixed(0)}%
        </p>
        <Button size="sm" variant={isWeak ? "destructive" : "outline"} className="h-7 px-2 text-[10px]" onClick={() => navigate("/study-now")}>
          {isWeak ? "Fix" : "Practice"}
        </Button>
      </div>
    </CardContent>
  </Card>
);

export default AnalyticsPage;

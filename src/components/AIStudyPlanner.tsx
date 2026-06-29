/**
 * AI Study Planner — v2
 * 3-tab actionable shell: Today / This Week / Insights
 * - Real task completion (study_plan_progress table)
 * - Plan adherence + streak
 * - Gemini-powered Hinglish insights (cached daily)
 * - Chapter-name fallback when topic is missing
 * - DB-driven defaults for new users (no hardcoded list)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar, BookOpen, Target, Sparkles, Flame, RefreshCw, Loader2,
  Sun, Sunset, Moon, AlertTriangle, CheckCircle2, Play, Trophy, TrendingUp,
  Lightbulb, Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

import { useAuth } from '@/contexts/AuthContext';
import { useExamDates } from '@/hooks/useExamDates';
import { useNavigate } from 'react-router-dom';
import { getDaysUntilDate, getExamDateForGrade } from '@/utils/examTimeline';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { normalizeTargetExam } from '@/config/goalConfig';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import { predictRank, generateSWOTAnalysis, categorizeTopics } from '@/lib/studyPlannerCore';
import safeLocalStorage from '@/utils/safeStorage';
import RoadmapView from '@/components/planner/RoadmapView';
import { normalizeExam } from '@/lib/roadmapEngine';

type SlotType = 'morning' | 'afternoon' | 'evening';
type TaskType = 'study' | 'revision' | 'mock_test';
type Priority = 'high' | 'medium' | 'low';

interface PlanTask {
  id: string;
  topic: string;
  subject: string;
  chapter: string;
  duration: number;
  type: TaskType;
  timeSlot: SlotType;
  priority: Priority;
  accuracy?: number;
}
interface DayPlan { dayName: string; date: string; isToday: boolean; isRestDay: boolean; tasks: PlanTask[]; totalMinutes: number; }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOT_ICON = { morning: Sun, afternoon: Sunset, evening: Moon } as const;
const SLOT_COLOR = { morning: 'text-amber-500', afternoon: 'text-orange-500', evening: 'text-indigo-500' } as const;
const PRIO_BORDER = {
  high: 'border-red-200 bg-red-50/40 dark:bg-red-950/20',
  medium: 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/20',
  low: 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20',
} as const;

const todayISO = () => new Date().toISOString().split('T')[0];
const hashTask = (t: PlanTask, date: string) =>
  `${date}::${t.timeSlot}::${t.subject}::${t.chapter}::${t.topic}::${t.type}`.toLowerCase().replace(/\s+/g, '_');

const getLabel = (t: any): { topic: string; chapter: string } => {
  const chapter = (t?.chapter || '').toString().trim();
  const topic = (t?.topic || '').toString().trim();
  return {
    topic: topic || chapter || 'General Practice',
    chapter: chapter || topic || 'Mixed',
  };
};

interface AIInsightsCache {
  date: string;
  insights: {
    personalizedGreeting?: string;
    strengthAnalysis?: string;
    weaknessStrategy?: string;
    motivationalMessage?: string;
    keyRecommendations?: string[];
  };
}

function buildPlanFromMastery(mastery: any[], chapterPool: any[]) {
  const { weak, medium, strong } = categorizeTopics(mastery);

  const pickFromPool = (idx: number, slot: SlotType, prio: Priority, type: TaskType, dur: number): PlanTask | null => {
    if (chapterPool.length === 0) return null;
    const c = chapterPool[idx % chapterPool.length];
    return {
      id: `${slot}-pool-${idx}`,
      topic: c.chapter_name || c.name || 'General',
      subject: formatSubjectDisplay(c.subject, c.chapter_name || c.name),
      chapter: c.chapter_name || c.name || 'Mixed',
      duration: dur, type, timeSlot: slot, priority: prio,
    };
  };

  const fromMastery = (t: any, slot: SlotType, prio: Priority, type: TaskType, dur: number): PlanTask => {
    const { topic, chapter } = getLabel(t);
    return {
      id: `${slot}-${t.subject}-${chapter}-${topic}`,
      topic, chapter,
      subject: formatSubjectDisplay(t.subject, chapter),
      duration: dur, type, timeSlot: slot, priority: prio, accuracy: t.accuracy,
    };
  };

  // TODAY
  const today: PlanTask[] = [];
  const w0 = weak[0]; const w1 = weak[1];
  if (w0) today.push(fromMastery(w0, 'morning', 'high', 'study', 45));
  else { const p = pickFromPool(0, 'morning', 'high', 'study', 45); if (p) today.push(p); }
  if (w1 || medium[0]) {
    today.push(fromMastery(w1 || medium[0], 'afternoon', w1 ? 'high' : 'medium', 'study', 35));
  } else { const p = pickFromPool(1, 'afternoon', 'medium', 'study', 35); if (p) today.push(p); }
  if (strong[0]) today.push(fromMastery(strong[0], 'evening', 'low', 'revision', 25));
  else if (medium[1]) today.push(fromMastery(medium[1], 'evening', 'medium', 'revision', 25));
  else { const p = pickFromPool(2, 'evening', 'low', 'revision', 25); if (p) today.push(p); }

  // WEEKLY (7 days)
  const weekly: DayPlan[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const dow = d.getDay();
    const iso = d.toISOString().split('T')[0];
    const isRest = dow === 0;
    const isToday = i === 0;
    const tasks: PlanTask[] = [];
    let mins = 0;

    if (isToday) {
      tasks.push(...today);
      mins = today.reduce((s, t) => s + t.duration, 0);
    } else if (isRest) {
      const r = strong[i % Math.max(1, strong.length)] || medium[i % Math.max(1, medium.length)];
      if (r) { const tk = fromMastery(r, 'afternoon', 'low', 'revision', 30); tk.id = `${iso}-rest`; tasks.push(tk); mins = 30; }
      else { const p = pickFromPool(i, 'afternoon', 'low', 'revision', 30); if (p) { p.id = `${iso}-rest`; tasks.push(p); mins = 30; } }
    } else if (dow === 6) {
      tasks.push({ id: `${iso}-mock`, topic: 'Full Mock Test', subject: 'Mixed', chapter: 'All Chapters', duration: 90, type: 'mock_test', timeSlot: 'morning', priority: 'high' });
      mins = 90;
      const wk = weak[i % Math.max(1, weak.length)];
      if (wk) { const tk = fromMastery(wk, 'afternoon', 'high', 'study', 45); tk.id = `${iso}-wk`; tasks.push(tk); mins += 45; }
    } else {
      const wk = weak[i % Math.max(1, weak.length)];
      const md = medium[i % Math.max(1, medium.length)];
      const st = strong[i % Math.max(1, strong.length)];
      if (wk) { const tk = fromMastery(wk, 'morning', 'high', 'study', 45); tk.id = `${iso}-wk`; tasks.push(tk); mins += 45; }
      else { const p = pickFromPool(i, 'morning', 'high', 'study', 45); if (p) { p.id = `${iso}-pm`; tasks.push(p); mins += 45; } }
      if (md) { const tk = fromMastery(md, 'afternoon', 'medium', 'study', 35); tk.id = `${iso}-md`; tasks.push(tk); mins += 35; }
      if (st) { const tk = fromMastery(st, 'evening', 'low', 'revision', 25); tk.id = `${iso}-st`; tasks.push(tk); mins += 25; }
    }

    weekly.push({ dayName: DAY_NAMES[dow], date: iso, isToday, isRestDay: isRest, tasks, totalMinutes: mins });
  }

  // SMART SUGGESTION
  let suggestion: { label: string; cta: string; navTo: string } | null = null;
  const staleStrong = strong.find(t => (t.daysSincePractice || 0) >= 7);
  const closeToMastery = medium.find(t => (t.accuracy || 0) >= 75);
  const isSaturday = now.getDay() === 6;
  if (isSaturday) suggestion = { label: 'Saturday hai — full mock test maaro!', cta: 'Start mock', navTo: '/test' };
  else if (staleStrong) suggestion = { label: `${getLabel(staleStrong).topic} ko ${staleStrong.daysSincePractice} din se touch nahi kiya`, cta: 'Revise now', navTo: `/study-now?subject=${encodeURIComponent(staleStrong.subject)}&chapter=${encodeURIComponent(staleStrong.chapter || '')}` };
  else if (closeToMastery) suggestion = { label: `${getLabel(closeToMastery).topic} ${Math.round(closeToMastery.accuracy)}% pe hai — 80% cross kar!`, cta: 'Push to mastery', navTo: `/study-now?subject=${encodeURIComponent(closeToMastery.subject)}&chapter=${encodeURIComponent(closeToMastery.chapter || '')}` };

  return { today, weekly, suggestion, weak, medium, strong };
}

export default function AIStudyPlanner() {
  const { user } = useAuth();
  const { getExamDate } = useExamDates();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [mastery, setMastery] = useState<any[]>([]);
  const [chapterPool, setChapterPool] = useState<any[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [targetExam, setTargetExam] = useState('JEE');
  const [completedHashes, setCompletedHashes] = useState<Set<string>>(new Set());
  const [adherence7d, setAdherence7d] = useState(0);
  const [planStreak, setPlanStreak] = useState(0);
  const [aiInsights, setAiInsights] = useState<AIInsightsCache['insights'] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const cachedGoal = (() => {
        try {
          const g = safeLocalStorage.getItem('userGoals');
          if (!g) return null;
          const p = JSON.parse(g);
          return normalizeTargetExam(p?.goal || p?.target_exam);
        } catch { return null; }
      })();

      const [profRes, qCountRes, masteryRes] = await Promise.all([
        supabase.from('my_profile' as any).select('*').maybeSingle(),
        supabase.from('question_attempts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('mode', 'practice'),
        supabase.from('topic_mastery').select('*').eq('user_id', user.id),
      ]);

      const prof = (profRes.data as any) || { target_exam: cachedGoal || 'JEE' };
      const goal = normalizeTargetExam((prof as any)?.target_exam || cachedGoal || 'JEE');
      setProfile(prof);
      setTargetExam(goal);
      setTotalQuestions(qCountRes.count || 0);
      setMastery(masteryRes.data || []);

      // chapter pool for new-user defaults — DB tags use JEE_MAINS / NEET
      const isNeet = goal.toUpperCase().includes('NEET');
      const examVariants = isNeet
        ? ['NEET', 'NEET_UG']
        : ['JEE', 'JEE_MAIN', 'JEE_MAINS', 'JEE_ADVANCED', 'JEE Main', 'JEE Mains'];
      const { data: chapData } = await supabase
        .from('chapters')
        .select('chapter_name, name, subject')
        .eq('is_active', true)
        .overlaps('exam_relevance', examVariants)
        .limit(60);
      const pool = (chapData || []).filter((c: any) => c.subject && (c.chapter_name || c.name));
      // shuffle deterministically by today's date
      const seed = new Date().getDate();
      pool.sort((a: any, b: any) => ((a.chapter_name || a.name).length + seed) - ((b.chapter_name || b.name).length + seed));
      setChapterPool(pool);

      // progress (last 7 days)
      const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
      const { data: progRows } = await supabase.from('study_plan_progress')
        .select('plan_date, task_hash')
        .eq('user_id', user.id)
        .gte('plan_date', sevenAgo.toISOString().split('T')[0]);

      const today = todayISO();
      const todayDone = new Set<string>();
      const byDate = new Map<string, number>();
      (progRows || []).forEach((r: any) => {
        if (r.plan_date === today) todayDone.add(r.task_hash);
        byDate.set(r.plan_date, (byDate.get(r.plan_date) || 0) + 1);
      });
      setCompletedHashes(todayDone);
    } catch (e) {
      logger.error('Planner load error', e);
      toast.error('Could not load planner data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const plan = useMemo(() => buildPlanFromMastery(mastery, chapterPool), [mastery, chapterPool]);
  const examDate = profile?.target_exam_date || getExamDateForGrade(getExamDate(targetExam as any), profile?.grade);
  const daysToExam = getDaysUntilDate(examDate) ?? 365;

  // adherence calc (uses plan.weekly to compute denominator)
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6);
      const { data } = await supabase.from('study_plan_progress')
        .select('plan_date')
        .eq('user_id', user.id)
        .gte('plan_date', sevenAgo.toISOString().split('T')[0]);
      const days = new Set((data || []).map((r: any) => r.plan_date));
      setAdherence7d(Math.round((days.size / 7) * 100));
      // streak: consecutive days back from today with at least 1 completion
      let s = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (days.has(d.toISOString().split('T')[0])) s++;
        else if (i > 0) break;
      }
      setPlanStreak(s);
    })();
  }, [user?.id, completedHashes]);

  // Load AI insights once per day per user
  useEffect(() => {
    if (!user?.id || loading) return;
    const key = `jeenie_plan_insights_${user.id}_${todayISO()}`;
    const cached = safeLocalStorage.getItem(key);
    if (cached) {
      try { setAiInsights(JSON.parse(cached)); return; } catch { /* noop */ }
    }
    setAiLoading(true);
    const weakLabels = plan.weak.slice(0, 5).map(t => `${t.subject} - ${getLabel(t).topic}: ${Math.round(t.accuracy || 0)}%`);
    const strongLabels = plan.strong.slice(0, 5).map(t => `${t.subject} - ${getLabel(t).topic}: ${Math.round(t.accuracy || 0)}%`);
    supabase.functions.invoke('generate-study-plan', {
      body: {
        userId: user.id,
        targetExam,
        studyHours: 4,
        daysRemaining: daysToExam,
        avgAccuracy: Math.round(profile?.overall_accuracy || 0),
        strengths: strongLabels,
        weaknesses: weakLabels,
      },
    }).then(({ data, error }) => {
      if (error || !data?.insights) return;
      setAiInsights(data.insights);
      try { safeLocalStorage.setItem(key, JSON.stringify(data.insights)); } catch { /* noop */ }
    }).finally(() => setAiLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, loading, targetExam]);

  const toggleDone = async (task: PlanTask) => {
    if (!user?.id) return;
    const date = todayISO();
    const hash = hashTask(task, date);
    const isDone = completedHashes.has(hash);
    const next = new Set(completedHashes);
    if (isDone) {
      next.delete(hash);
      setCompletedHashes(next);
      await supabase.from('study_plan_progress').delete()
        .eq('user_id', user.id).eq('plan_date', date).eq('task_hash', hash);
    } else {
      next.add(hash);
      setCompletedHashes(next);
      await supabase.from('study_plan_progress').upsert({
        user_id: user.id, plan_date: date, task_hash: hash,
        task_label: `${task.subject} - ${task.topic}`,
      } as any, { onConflict: 'user_id,plan_date,task_hash' });
      toast.success('Task complete! 🎯');
    }
  };

  const startPractice = (task: PlanTask) => {
    if (task.type === 'mock_test') { navigate('/test'); return; }
    const params = new URLSearchParams();
    params.set('subject', task.subject);
    if (task.chapter) params.set('chapter', task.chapter);
    if (task.topic && task.topic !== task.chapter) params.set('topic', task.topic);
    navigate(`/study-now?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Building your study plan...</p>
        </div>
      </div>
    );
  }

  const todayDoneCount = plan.today.filter(t => completedHashes.has(hashTask(t, todayISO()))).length;
  const rank = predictRank(profile?.overall_accuracy || 0, totalQuestions, targetExam);
  const swot = generateSWOTAnalysis({ weak: plan.weak, medium: plan.medium, strong: plan.strong });
  const greeting = aiInsights?.personalizedGreeting || `Chal ${targetExam} champion, aaj ka plan ready hai!`;

  return (
    <div className="space-y-3 py-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Study Planner
          </h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {aiLoading ? 'JEEnie analyzing your data…' : greeting}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} className="shrink-0">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: 'Days', value: daysToExam, icon: Calendar, color: 'text-blue-600' },
          { label: 'Accuracy', value: `${Math.round(profile?.overall_accuracy || 0)}%`, icon: Target, color: 'text-emerald-600' },
          { label: 'Streak', value: `${planStreak}🔥`, icon: Flame, color: 'text-orange-600' },
          { label: 'Adherence', value: `${adherence7d}%`, icon: Trophy, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-2 text-center">
              <s.icon className={`w-4 h-4 mx-auto mb-0.5 ${s.color}`} />
              <p className="text-sm font-bold leading-tight">{s.value}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="roadmap" className="w-full">
        <TabsList className="grid grid-cols-3 w-full h-9">
          <TabsTrigger value="roadmap" className="text-xs">Roadmap</TabsTrigger>
          <TabsTrigger value="week" className="text-xs">This Week</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
        </TabsList>

        {/* ROADMAP — mentor-driven chapter ladder */}
        <TabsContent value="roadmap" className="space-y-3 mt-3">
          {user?.id && (
            <RoadmapView
              userId={user.id}
              exam={normalizeExam(targetExam)}
            />
          )}
        </TabsContent>



        {/* WEEK */}
        <TabsContent value="week" className="space-y-3 mt-3">
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-7 gap-1">
                {plan.weekly.map((day) => (
                  <div key={day.date} className={`text-center p-1.5 rounded-lg border transition-all ${day.isToday ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : day.isRestDay ? 'border-border/50 bg-muted/30' : 'border-border/50'}`}>
                    <p className={`text-[9px] font-bold ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.dayName}</p>
                    <p className="text-sm font-bold mt-0.5">{day.isRestDay ? '😴' : day.tasks.length}</p>
                    <p className="text-[8px] text-muted-foreground">{day.isRestDay ? 'Rest' : `${day.totalMinutes}m`}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {plan.weekly.filter(d => !d.isToday).map(day => (
            <Card key={day.date} className="border-border/50">
              <CardHeader className="p-3 pb-1.5">
                <CardTitle className="text-xs flex items-center justify-between">
                  <span>{day.dayName} {day.isRestDay && '(Rest)'} {day.date.split('-').slice(1).join('/')}</span>
                  <Badge variant="outline" className="text-[9px]">{day.totalMinutes} min</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                {day.tasks.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">Light day</p>
                ) : day.tasks.map((t, i) => {
                  const Icon = SLOT_ICON[t.timeSlot];
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <Icon className={`w-3 h-3 ${SLOT_COLOR[t.timeSlot]}`} />
                      <span className="flex-1 truncate"><span className="font-medium">{t.topic}</span> <span className="text-muted-foreground">• {t.subject}</span></span>
                      <span className="text-muted-foreground text-[10px]">{t.duration}m</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* INSIGHTS */}
        <TabsContent value="insights" className="space-y-3 mt-3">
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-purple-500/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold">Rank Projection</p>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-primary">{rank.percentileRange}</span>
                <span className="text-[10px] text-muted-foreground">~Rank {rank.currentRank.toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Target {rank.targetRank.toLocaleString()} • ~{rank.improvementWeeks} weeks at +2%/week
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="p-2.5">
                <p className="text-[10px] font-bold text-emerald-700 mb-1">💪 STRENGTHS</p>
                {swot.strengths.slice(0, 3).map((s, i) => (
                  <p key={i} className="text-[10px] text-foreground/80 truncate">• {s}</p>
                ))}
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/40 dark:bg-red-950/20">
              <CardContent className="p-2.5">
                <p className="text-[10px] font-bold text-red-700 mb-1">⚠️ WEAKNESSES</p>
                {swot.weaknesses.slice(0, 3).map((s, i) => (
                  <p key={i} className="text-[10px] text-foreground/80 truncate">• {s}</p>
                ))}
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20">
              <CardContent className="p-2.5">
                <p className="text-[10px] font-bold text-blue-700 mb-1">🚀 OPPORTUNITIES</p>
                {swot.opportunities.slice(0, 3).map((s, i) => (
                  <p key={i} className="text-[10px] text-foreground/80 truncate">• {s}</p>
                ))}
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="p-2.5">
                <p className="text-[10px] font-bold text-amber-700 mb-1">⏰ THREATS</p>
                {swot.threats.slice(0, 3).map((s, i) => (
                  <p key={i} className="text-[10px] text-foreground/80 truncate">• {s}</p>
                ))}
              </CardContent>
            </Card>
          </div>

          {aiInsights?.weaknessStrategy && (
            <Card className="border-primary/20">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold">JEEnie's Strategy</p>
                </div>
                <p className="text-[11px] leading-relaxed text-foreground/85">{aiInsights.weaknessStrategy}</p>
                {aiInsights.motivationalMessage && (
                  <p className="text-[11px] leading-relaxed text-primary mt-2 font-medium">{aiInsights.motivationalMessage}</p>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="p-2 text-center">
              <AlertTriangle className="w-4 h-4 text-red-500 mx-auto mb-0.5" />
              <p className="text-base font-bold text-red-600">{plan.weak.length}</p>
              <p className="text-[9px] text-muted-foreground">Weak</p>
            </CardContent></Card>
            <Card><CardContent className="p-2 text-center">
              <Target className="w-4 h-4 text-amber-500 mx-auto mb-0.5" />
              <p className="text-base font-bold text-amber-600">{plan.medium.length}</p>
              <p className="text-[9px] text-muted-foreground">Medium</p>
            </CardContent></Card>
            <Card><CardContent className="p-2 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-0.5" />
              <p className="text-base font-bold text-emerald-600">{plan.strong.length}</p>
              <p className="text-[9px] text-muted-foreground">Strong</p>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

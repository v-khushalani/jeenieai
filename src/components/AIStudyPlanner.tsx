import safeLocalStorage from '@/utils/safeStorage';
/**
 * AI Study Planner - Rebuilt from scratch
 * Works for ALL users with 0 data requirement
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Calendar, BookOpen, Target, Brain, Flame,
  TrendingUp, Sparkles, RefreshCw, Loader2,
  Sun, Sunset, Moon, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useExamDates } from '@/hooks/useExamDates';
import { getDaysUntilDate, getExamDateForGrade } from '@/utils/examTimeline';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { normalizeTargetExam } from '@/config/goalConfig';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';

interface TodayTask {
  topic: string;
  subject: string;
  chapter: string;
  duration: number;
  type: 'study' | 'revision' | 'mock_test';
  timeSlot: 'morning' | 'afternoon' | 'evening';
  priority: 'high' | 'medium' | 'low';
  accuracy?: number;
}

interface DayPlan {
  dayName: string;
  date: string;
  isToday: boolean;
  isRestDay: boolean;
  tasks: TodayTask[];
  totalMinutes: number;
}

interface PlannerData {
  todayTasks: TodayTask[];
  weeklyPlan: DayPlan[];
  stats: {
    totalQuestions: number;
    avgAccuracy: number;
    streak: number;
    daysToExam: number;
    targetExam: string;
    weakCount: number;
    strongCount: number;
    totalTopics: number;
  };
  isLoading: boolean;
}

const MIN_QUESTIONS_REQUIRED = 10;
const PLANNER_LOAD_TIMEOUT_MS = 8000;

const normalizeDateString = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
};

const calculateDaysToExam = (examDate: string) => {
  if (!examDate) return 365;
  const normalized = normalizeDateString(examDate);
  if (!normalized) return 365;
  const [year, month, day] = normalized.split('-').map(Number);
  const today = new Date();
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const exam = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.ceil((exam - current) / 86400000));
};

const TIME_SLOT_ICONS = {
  morning: <Sun className="w-3.5 h-3.5 text-amber-500" />,
  afternoon: <Sunset className="w-3.5 h-3.5 text-orange-500" />,
  evening: <Moon className="w-3.5 h-3.5 text-indigo-500" />,
};

const PRIORITY_COLORS = {
  high: 'border-red-200 bg-red-50/50 dark:bg-red-950/20',
  medium: 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20',
  low: 'border-green-200 bg-green-50/50 dark:bg-green-950/20',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getCachedTargetExam = () => {
  try {
    const cachedGoals = safeLocalStorage.getItem('userGoals');
    if (!cachedGoals) return null;

    const parsedGoals = JSON.parse(cachedGoals);
    return normalizeTargetExam(parsedGoals?.goal || parsedGoals?.target_exam);
  } catch {
    return null;
  }
};

// Default syllabus topics for when user has no data
const DEFAULT_TOPICS: Record<string, { subject: string; chapter: string; topics: string[] }[]> = {
  JEE: [
    { subject: 'Physics', chapter: 'Mechanics', topics: ['Laws of Motion', 'Work, Energy & Power', 'Rotational Motion'] },
    { subject: 'Physics', chapter: 'Electrodynamics', topics: ['Current Electricity', 'Electromagnetic Induction'] },
    { subject: 'Chemistry', chapter: 'Physical Chemistry', topics: ['Chemical Equilibrium', 'Thermodynamics', 'Electrochemistry'] },
    { subject: 'Chemistry', chapter: 'Organic Chemistry', topics: ['GOC', 'Hydrocarbons', 'Alcohols & Phenols'] },
    { subject: 'Mathematics', chapter: 'Calculus', topics: ['Limits & Continuity', 'Differentiation', 'Integration'] },
    { subject: 'Mathematics', chapter: 'Algebra', topics: ['Complex Numbers', 'Matrices & Determinants'] },
  ],
  NEET: [
    { subject: 'Physics', chapter: 'Mechanics', topics: ['Laws of Motion', 'Work, Energy & Power'] },
    { subject: 'Chemistry', chapter: 'Physical Chemistry', topics: ['Chemical Equilibrium', 'Solutions'] },
    { subject: 'Biology', chapter: 'Cell Biology', topics: ['Cell Structure', 'Cell Division', 'Biomolecules'] },
    { subject: 'Biology', chapter: 'Genetics', topics: ['Inheritance', 'Molecular Basis', 'Evolution'] },
  ],
};

function generatePlanFromData(
  topicMastery: any[],
  profile: any,
  targetExam: string
): { todayTasks: TodayTask[]; weeklyPlan: DayPlan[]; weakCount: number; strongCount: number; totalTopics: number } {
  const weak: any[] = [];
  const medium: any[] = [];
  const strong: any[] = [];

  topicMastery.forEach(t => {
    const acc = t.accuracy || 0;
    if (acc < 60) weak.push(t);
    else if (acc < 80) medium.push(t);
    else strong.push(t);
  });

  // Sort by priority (lowest accuracy first for weak)
  weak.sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0));
  medium.sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0));

  // Generate today's tasks
  const todayTasks: TodayTask[] = [];

  // Morning: 2 weak topics
  weak.slice(0, 2).forEach(t => {
    todayTasks.push({
      topic: t.topic || 'Unknown Topic',
      subject: formatSubjectDisplay(t.subject, t.chapter),
      chapter: t.chapter || '',
      duration: 45,
      type: 'study',
      timeSlot: 'morning',
      priority: 'high',
      accuracy: t.accuracy,
    });
  });

  // Afternoon: 1-2 medium topics
  medium.slice(0, 2).forEach(t => {
    todayTasks.push({
      topic: t.topic || 'Unknown Topic',
      subject: formatSubjectDisplay(t.subject, t.chapter),
      chapter: t.chapter || '',
      duration: 35,
      type: 'study',
      timeSlot: 'afternoon',
      priority: 'medium',
      accuracy: t.accuracy,
    });
  });

  // Evening: revision of strong topics
  strong.slice(0, 2).forEach(t => {
    todayTasks.push({
      topic: t.topic || 'Unknown Topic',
      subject: formatSubjectDisplay(t.subject, t.chapter),
      chapter: t.chapter || '',
      duration: 25,
      type: 'revision',
      timeSlot: 'evening',
      priority: 'low',
      accuracy: t.accuracy,
    });
  });

  // If no topics at all, use defaults
  if (todayTasks.length === 0) {
    const examKey = targetExam?.includes('NEET') ? 'NEET' : 'JEE';
    const defaults = DEFAULT_TOPICS[examKey] || DEFAULT_TOPICS.JEE;
    const today = new Date().getDay();

    defaults.slice(0, 3).forEach((d, i) => {
      const topic = d.topics[today % d.topics.length];
      todayTasks.push({
        topic,
        subject: formatSubjectDisplay(d.subject, d.chapter),
        chapter: d.chapter,
        duration: i === 0 ? 45 : 35,
        type: i < 2 ? 'study' : 'revision',
        timeSlot: i === 0 ? 'morning' : i === 1 ? 'afternoon' : 'evening',
        priority: i === 0 ? 'high' : i === 1 ? 'medium' : 'low',
      });
    });
  }

  // Generate 7-day weekly plan
  const today = new Date();
  const weeklyPlan: DayPlan[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfWeek = date.getDay();
    const isRestDay = dayOfWeek === 0;
    const isToday = i === 0;

    const tasks: TodayTask[] = [];
    let totalMinutes = 0;

    if (isRestDay) {
      // Light revision on Sunday
      const revTopics = strong.length > 0 ? strong.slice(0, 2) : (medium.length > 0 ? medium.slice(0, 1) : []);
        revTopics.forEach(t => {
        tasks.push({ topic: t.topic || 'Revision', subject: formatSubjectDisplay(t.subject, t.chapter), chapter: t.chapter || '', duration: 30, type: 'revision', timeSlot: 'afternoon', priority: 'low', accuracy: t.accuracy });
        totalMinutes += 30;
      });
      if (tasks.length === 0) {
        tasks.push({ topic: 'Light Revision', subject: 'Mixed', chapter: '', duration: 30, type: 'revision', timeSlot: 'afternoon', priority: 'low' });
        totalMinutes = 30;
      }
    } else if (dayOfWeek === 6) {
      // Saturday: Mock test day
      tasks.push({ topic: 'Full Mock Test', subject: 'Mixed', chapter: 'All Chapters', duration: 90, type: 'mock_test', timeSlot: 'morning', priority: 'high' });
      totalMinutes = 90;
      // Plus weak topic study
      const wk = weak[i % Math.max(1, weak.length)];
        if (wk) {
        tasks.push({ topic: wk.topic || 'Weak Area', subject: formatSubjectDisplay(wk.subject, wk.chapter), chapter: wk.chapter || '', duration: 45, type: 'study', timeSlot: 'afternoon', priority: 'high', accuracy: wk.accuracy });
        totalMinutes += 45;
      }
    } else {
      // Weekdays
      const wkIdx = i % Math.max(1, weak.length);
      const mdIdx = i % Math.max(1, medium.length);

        if (weak[wkIdx]) {
        tasks.push({ topic: weak[wkIdx].topic || 'Weak Topic', subject: formatSubjectDisplay(weak[wkIdx].subject, weak[wkIdx].chapter), chapter: weak[wkIdx].chapter || '', duration: 45, type: 'study', timeSlot: 'morning', priority: 'high', accuracy: weak[wkIdx].accuracy });
        totalMinutes += 45;
      }
      if (medium[mdIdx]) {
        tasks.push({ topic: medium[mdIdx].topic || 'Medium Topic', subject: formatSubjectDisplay(medium[mdIdx].subject, medium[mdIdx].chapter), chapter: medium[mdIdx].chapter || '', duration: 35, type: 'study', timeSlot: 'afternoon', priority: 'medium', accuracy: medium[mdIdx].accuracy });
        totalMinutes += 35;
      }
      const stIdx = i % Math.max(1, strong.length);
      if (strong[stIdx]) {
        tasks.push({ topic: strong[stIdx].topic || 'Revision', subject: formatSubjectDisplay(strong[stIdx].subject, strong[stIdx].chapter), chapter: strong[stIdx].chapter || '', duration: 25, type: 'revision', timeSlot: 'evening', priority: 'low', accuracy: strong[stIdx].accuracy });
        totalMinutes += 25;
      }

      // If no mastery data, use defaults
      if (tasks.length === 0) {
        const examKey = targetExam?.includes('NEET') ? 'NEET' : 'JEE';
        const defaults = DEFAULT_TOPICS[examKey] || DEFAULT_TOPICS.JEE;
        const dGroup = defaults[(i + dayOfWeek) % defaults.length];
        const tp = dGroup.topics[i % dGroup.topics.length];
        tasks.push({ topic: tp, subject: formatSubjectDisplay(dGroup.subject, dGroup.chapter), chapter: dGroup.chapter, duration: 45, type: 'study', timeSlot: 'morning', priority: 'high' });
        totalMinutes = 45;
      }
    }

    weeklyPlan.push({
      dayName: DAY_NAMES[dayOfWeek],
      date: date.toISOString().split('T')[0],
      isToday,
      isRestDay,
      tasks,
      totalMinutes,
    });
  }

  return { todayTasks, weeklyPlan, weakCount: weak.length, strongCount: strong.length, totalTopics: topicMastery.length };
}

export default function AIStudyPlanner() {
  const { user } = useAuth();
  const { getExamDate } = useExamDates();
  const loadRequestRef = React.useRef(0);
  const [data, setData] = useState<PlannerData>({
    todayTasks: [],
    weeklyPlan: [],
    stats: { totalQuestions: 0, avgAccuracy: 0, streak: 0, daysToExam: 365, targetExam: 'JEE', weakCount: 0, strongCount: 0, totalTopics: 0 },
    isLoading: true,
  });
  const [isFallbackPlan, setIsFallbackPlan] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    const requestId = ++loadRequestRef.current;
    const cachedTargetExam = getCachedTargetExam();

    const commitPlan = (
      targetExam: string,
      profile: any,
      totalQuestions: number,
      topicMastery: any[],
      isFallback: boolean,
      reason: string | null
    ) => {
      const examDate = normalizeDateString(profile?.target_exam_date || getExamDateForGrade(getExamDate(targetExam as any), profile?.grade));
      const daysToExam = getDaysUntilDate(examDate) ?? calculateDaysToExam(examDate);
      const { todayTasks, weeklyPlan, weakCount, strongCount, totalTopics } = generatePlanFromData(
        isFallback ? [] : topicMastery,
        profile,
        targetExam
      );

      setIsFallbackPlan(isFallback);
      setFallbackReason(reason);
      setData({
        todayTasks,
        weeklyPlan,
        stats: {
          totalQuestions,
          avgAccuracy: profile?.overall_accuracy || 0,
          streak: profile?.current_streak || 0,
          daysToExam,
          targetExam,
          weakCount,
          strongCount,
          totalTopics,
        },
        isLoading: false,
      });
    };

    try {
      setData(prev => ({ ...prev, isLoading: true }));
      setIsFallbackPlan(false);
      setFallbackReason(null);

      const loadPromise = Promise.all([
        supabase.from('my_profile' as any).select('*').maybeSingle(),
        supabase.from('question_attempts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('mode', 'practice'),
        supabase.from('topic_mastery').select('*').eq('user_id', user.id),
      ]).then(([profileResult, questionCountResult, topicMasteryResult]) => ({
        profile: profileResult.data,
        profileError: profileResult.error,
        totalQuestions: questionCountResult.count || 0,
        questionError: questionCountResult.error,
        topicMastery: topicMasteryResult.data || [],
        topicError: topicMasteryResult.error,
      }));

      const timeoutPromise = new Promise<{ timeout: true }>(resolve => {
        setTimeout(() => resolve({ timeout: true }), PLANNER_LOAD_TIMEOUT_MS);
      });

      const result = await Promise.race([loadPromise, timeoutPromise]);

      if (requestId !== loadRequestRef.current) return;

      if ('timeout' in result) {
        const targetExam = cachedTargetExam || 'JEE';
        commitPlan(
          targetExam,
          { target_exam: targetExam, overall_accuracy: 0, current_streak: 0 },
          0,
          [],
          true,
          'Using a starter plan while your study data finishes loading.'
        );
        return;
      }

      const targetExam = normalizeTargetExam((result.profile as any)?.target_exam || cachedTargetExam || 'JEE');
      const totalQuestions = result.totalQuestions;
      const topicMastery = result.topicMastery;
      const hasEnoughData =
        !result.profileError &&
        !result.questionError &&
        !result.topicError &&
        totalQuestions >= MIN_QUESTIONS_REQUIRED &&
        topicMastery.length >= 3;

      if (!hasEnoughData) {
        const reason = result.questionError || result.topicError || result.profileError
          ? 'Using a starter plan while we recover your study data.'
          : totalQuestions === 0 && topicMastery.length === 0
            ? 'Using a starter plan until your first practice data arrives.'
            : `Using a starter plan because only ${totalQuestions} questions and ${topicMastery.length} topics are available.`;

        commitPlan(
          targetExam,
          result.profile || { target_exam: targetExam, overall_accuracy: 0, current_streak: 0 },
          totalQuestions,
          topicMastery,
          true,
          reason
        );
        return;
      }

      commitPlan(targetExam, result.profile, totalQuestions, topicMastery, false, null);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      logger.error('Error loading planner data:', error);
      const targetExam = cachedTargetExam || 'JEE';
      commitPlan(
        targetExam,
        { target_exam: targetExam, overall_accuracy: 0, current_streak: 0 },
        0,
        [],
        true,
        'Using a starter plan because your study data could not be loaded right now.'
      );
      toast.error('Showing a starter plan while we reload your study data');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (data.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Building your study plan...</p>
        </div>
      </div>
    );
  }

  const { todayTasks, weeklyPlan, stats } = data;

  return (
    <div className="space-y-4">
      {isFallbackPlan && fallbackReason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4" />
            Starter plan
          </div>
          <p className="mt-1">{fallbackReason}</p>
        </div>
      )}

      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            AI Study Planner
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Personalized plan based on your performance</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Days to Exam', value: stats.daysToExam, icon: Calendar, color: 'text-blue-600' },
          { label: 'Accuracy', value: `${Math.round(stats.avgAccuracy)}%`, icon: Target, color: 'text-emerald-600' },
          { label: 'Streak', value: `${stats.streak}🔥`, icon: Flame, color: 'text-orange-600' },
          { label: 'Questions', value: stats.totalQuestions, icon: BookOpen, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-3 text-center">
              <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's Plan */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Today's Plan
            <Badge variant="outline" className="text-[10px] ml-auto">{todayTasks.length} tasks</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {todayTasks.map((task, i) => (
            <div key={`${task.subject}-${task.topic}-${task.timeSlot}-${i}`} className={`p-3 rounded-xl border ${PRIORITY_COLORS[task.priority]} transition-all`}>
              <div className="flex items-center gap-3">
                {TIME_SLOT_ICONS[task.timeSlot]}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{task.topic}</p>
                  <p className="text-[10px] text-muted-foreground">{task.subject} • {task.chapter}</p>
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={task.type === 'study' ? 'default' : task.type === 'revision' ? 'secondary' : 'outline'} className="text-[10px]">
                    {task.type === 'mock_test' ? '📝 Mock' : task.type === 'revision' ? '🔄 Revise' : '📚 Study'}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{task.duration} min</p>
                </div>
              </div>
              {task.accuracy !== undefined && (
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={task.accuracy} className="h-1.5 flex-1" />
                  <span className={`text-[10px] font-medium ${task.accuracy >= 80 ? 'text-emerald-600' : task.accuracy >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                    {Math.round(task.accuracy)}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Weekly Overview */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Weekly Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {weeklyPlan.map((day, i) => (
              <div key={`${day.date}-${day.dayName}-${i}`} className={`text-center p-2 rounded-xl border transition-all ${day.isToday ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : day.isRestDay ? 'border-border/50 bg-muted/30' : 'border-border/50'}`}>
                <p className={`text-[10px] font-bold ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {day.dayName}
                </p>
                <p className="text-xs font-bold text-foreground mt-1">
                  {day.isRestDay ? '😴' : `${day.tasks.length}`}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {day.isRestDay ? 'Rest' : `${day.totalMinutes}m`}
                </p>
              </div>
            ))}
          </div>

          {/* Today's detailed view in weekly section */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Today's Focus Areas</p>
            <div className="flex flex-wrap gap-2">
              {todayTasks.map((task, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">
                  {task.subject}: {task.topic}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Summary */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Progress Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200">
              <AlertTriangle className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-red-600">{stats.weakCount}</p>
              <p className="text-[10px] text-muted-foreground">Weak Topics</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-emerald-600">{stats.strongCount}</p>
              <p className="text-[10px] text-muted-foreground">Strong Topics</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200">
              <BookOpen className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-blue-600">{stats.totalTopics}</p>
              <p className="text-[10px] text-muted-foreground">Total Topics</p>
            </div>
          </div>

          {stats.totalQuestions === 0 && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-center">
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-sm font-medium text-foreground">Start practicing to unlock personalized insights!</p>
              <p className="text-[10px] text-muted-foreground mt-1">Your plan will adapt as you practice more questions</p>
            </div>
          )}

          <div className="text-center">
            <Badge variant="outline" className="text-xs">
              {stats.targetExam} • {stats.daysToExam} days remaining
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useExamDates } from '@/hooks/useExamDates';
import { normalizeTargetExam } from '@/config/goalConfig';
import { getDaysUntilDate, getExamDateForGrade } from '@/utils/examTimeline';
import { logger } from '@/utils/logger';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import { getSubjectAliases, normalizeSubject } from '@/lib/subjectNormalization';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import RoadmapView from '@/components/planner/RoadmapView';
import {
  buildAllSubjectRoadmaps,
  examRelevanceValues,
  normalizeExam,
  subjectsForExam,
  type RoadmapChapter,
  type SubjectRoadmap,
} from '@/lib/roadmapEngine';
import safeLocalStorage from '@/utils/safeStorage';

type ExamKey = 'JEE' | 'NEET';
type ChapterStatus = 'pending' | 'weak' | 'medium' | 'strong' | 'done';
type TaskType = 'learn' | 'drill' | 'review' | 'test';

interface ChapterMetric {
  id: string;
  subject: string;
  title: string;
  chapterNumber: number | null;
  classLevel: number | null;
  totalQuestions: number;
  attempts: number;
  correct: number;
  wrong: number;
  pendingMistakes: number;
  accuracy: number;
  status: ChapterStatus;
  priorityScore: number;
  lastAttemptAt: string | null;
}

interface PlannerTask {
  id: string;
  date: string;
  dayName: string;
  title: string;
  subtitle: string;
  subject: string;
  chapter: string;
  chapterId?: string;
  duration: number;
  type: TaskType;
  priority: 'high' | 'medium' | 'low';
  actionLabel: string;
  href: string;
}

interface DayPlan {
  date: string;
  dayName: string;
  totalMinutes: number;
  tasks: PlannerTask[];
}

interface PlannerData {
  roadmaps: SubjectRoadmap[];
  chapters: ChapterMetric[];
  bySubject: Record<string, ChapterMetric[]>;
  weak: ChapterMetric[];
  medium: ChapterMetric[];
  strong: ChapterMetric[];
  pending: ChapterMetric[];
  active: ChapterMetric | null;
  next: ChapterMetric | null;
  weekly: DayPlan[];
  coveragePct: number;
  totalQuestions: number;
  totalAttempts: number;
  overallAccuracy: number;
  pendingMistakes: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const todayISO = () => new Date().toISOString().split('T')[0];

const taskHash = (task: PlannerTask) =>
  `${task.date}::${task.type}::${task.chapterId || task.subject}::${task.title}`.toLowerCase().replace(/\s+/g, '_');

const daysSince = (iso: string | null) => {
  if (!iso) return 99;
  const parsed = new Date(iso).getTime();
  if (Number.isNaN(parsed)) return 99;
  return Math.max(0, Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24)));
};

const buildPracticeHref = (chapter: ChapterMetric, type: TaskType) => {
  const params = new URLSearchParams();
  params.set('chapter_id', chapter.id);
  params.set('subject', chapter.subject);
  params.set('chapter', chapter.title);
  params.set('mode', type);
  return `/study-now?${params.toString()}`;
};

const buildTestHref = (chapter: ChapterMetric) => {
  const params = new URLSearchParams();
  params.set('chapter_id', chapter.id);
  params.set('subject', chapter.subject);
  params.set('chapter', chapter.title);
  params.set('mode', 'chapter');
  return `/test?${params.toString()}`;
};

const makeTask = (chapter: ChapterMetric, date: string, type: TaskType, index: number): PlannerTask => {
  const dayName = DAY_NAMES[new Date(date).getDay()];
  const base = {
    id: `${date}-${type}-${chapter.id}-${index}`,
    date,
    dayName,
    subject: chapter.subject,
    chapter: chapter.title,
    chapterId: chapter.id,
  };

  if (type === 'review') {
    return {
      ...base,
      title: 'Mistake repair',
      subtitle: `${chapter.pendingMistakes || chapter.wrong} galat questions dobara kar`,
      duration: 30,
      type,
      priority: 'high',
      actionLabel: 'Review',
      href: buildPracticeHref(chapter, 'review'),
    };
  }

  if (type === 'drill') {
    return {
      ...base,
      title: 'Weakness drill',
      subtitle: `${Math.round(chapter.accuracy)}% accuracy ko 70%+ push kar`,
      duration: 40,
      type,
      priority: 'high',
      actionLabel: 'Drill',
      href: buildPracticeHref(chapter, 'drill'),
    };
  }

  if (type === 'test') {
    return {
      ...base,
      title: 'Chapter test',
      subtitle: `${chapter.title} ka timed checkpoint`,
      duration: 60,
      type,
      priority: 'medium',
      actionLabel: 'Test',
      href: buildTestHref(chapter),
    };
  }

  return {
    ...base,
    title: 'Start / continue chapter',
    subtitle: `${chapter.attempts}/15 foundation questions done`,
    duration: 45,
    type,
    priority: chapter.attempts === 0 ? 'high' : 'medium',
    actionLabel: 'Practice',
    href: buildPracticeHref(chapter, 'learn'),
  };
};

function chooseChapterForTask(data: {
  active: ChapterMetric | null;
  weak: ChapterMetric[];
  medium: ChapterMetric[];
  strong: ChapterMetric[];
  pending: ChapterMetric[];
}, dayIndex: number, type: TaskType) {
  if (type === 'review') {
    return data.weak.find((c) => c.pendingMistakes > 0) || data.medium.find((c) => c.pendingMistakes > 0) || data.active || data.pending[0] || null;
  }
  if (type === 'drill') return data.weak[dayIndex % Math.max(1, data.weak.length)] || data.active || data.pending[0] || null;
  if (type === 'test') return data.medium[dayIndex % Math.max(1, data.medium.length)] || data.active || data.strong[0] || data.pending[0] || null;
  return data.active || data.pending[dayIndex % Math.max(1, data.pending.length)] || data.weak[0] || null;
}

function buildWeeklyPlan(seed: Omit<PlannerData, 'weekly'>): DayPlan[] {
  const days: DayPlan[] = [];
  const now = new Date();
  const pattern: TaskType[][] = [
    ['learn', 'drill', 'review'],
    ['learn', 'drill'],
    ['review', 'learn'],
    ['drill', 'learn'],
    ['learn', 'test'],
    ['test', 'review'],
    ['review'],
  ];

  for (let i = 0; i < 7; i += 1) {
    const dateObj = new Date(now);
    dateObj.setDate(now.getDate() + i);
    const date = dateObj.toISOString().split('T')[0];
    const types = pattern[i] || ['learn'];
    const tasks = types
      .map((type, idx) => {
        const chapter = chooseChapterForTask(seed, i + idx, type);
        return chapter ? makeTask(chapter, date, type, idx) : null;
      })
      .filter(Boolean) as PlannerTask[];

    days.push({
      date,
      dayName: DAY_NAMES[dateObj.getDay()],
      totalMinutes: tasks.reduce((sum, task) => sum + task.duration, 0),
      tasks,
    });
  }

  return days;
}

const emptyPlanner = (): PlannerData => ({
  roadmaps: [],
  chapters: [],
  bySubject: {},
  weak: [],
  medium: [],
  strong: [],
  pending: [],
  active: null,
  next: null,
  weekly: [],
  coveragePct: 0,
  totalQuestions: 0,
  totalAttempts: 0,
  overallAccuracy: 0,
  pendingMistakes: 0,
});

function metricFromRoadmapChapter(chapter: RoadmapChapter): ChapterMetric {
  const learn = chapter.milestones.find((m) => m.key === 'learn');
  const review = chapter.milestones.find((m) => m.key === 'review');
  const pendingMistakes = review && review.state !== 'done' ? Math.max(0, review.current) : 0;
  const accuracy = Math.round((chapter.accuracy || 0) * 100);
  const wrong = Math.max(0, chapter.attempts - chapter.correct);
  let status: ChapterStatus = 'pending';

  if (chapter.status === 'done') status = 'done';
  else if (chapter.attempts > 0 && accuracy < 60) status = 'weak';
  else if (chapter.attempts > 0 && accuracy < 80) status = 'medium';
  else if (chapter.attempts > 0) status = 'strong';

  const priorityScore =
    (status === 'weak' ? 120 : status === 'medium' ? 70 : status === 'pending' ? 45 : 20) +
    pendingMistakes * 8 +
    Math.max(0, (learn?.target || 15) - chapter.attempts);

  return {
    id: chapter.id,
    subject: normalizeSubject(chapter.subject),
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    classLevel: chapter.classLevel,
    totalQuestions: 0,
    attempts: chapter.attempts,
    correct: chapter.correct,
    wrong,
    pendingMistakes,
    accuracy,
    status,
    priorityScore,
    lastAttemptAt: null,
  };
}

async function loadPlannerData(userId: string, exam: ExamKey): Promise<PlannerData> {
  const canonicalSubjects = subjectsForExam(exam);
  const subjectAliases = Array.from(new Set(canonicalSubjects.flatMap((subject) => getSubjectAliases(subject))));

  const { data: chapterRows, error: chapterError } = await supabase
    .from('chapters')
    .select('id, subject, chapter_name, name, chapter_number, class_level')
    .eq('is_active', true)
    .in('subject', subjectAliases)
    .overlaps('exam_relevance', examRelevanceValues(exam))
    .order('subject', { ascending: true })
    .order('class_level', { ascending: true, nullsFirst: false })
    .order('chapter_number', { ascending: true, nullsFirst: false })
    .limit(260);

  if (chapterError) throw chapterError;

  const chapterMap = new Map<string, ChapterMetric>();
  (chapterRows || []).forEach((row: any) => {
    const subject = normalizeSubject(row.subject || '');
    if (!canonicalSubjects.includes(subject)) return;
    const title = (row.chapter_name || row.name || 'Chapter').toString().trim();
    chapterMap.set(row.id, {
      id: row.id,
      subject,
      title,
      chapterNumber: row.chapter_number ?? null,
      classLevel: row.class_level ?? null,
      totalQuestions: 0,
      attempts: 0,
      correct: 0,
      wrong: 0,
      pendingMistakes: 0,
      accuracy: 0,
      status: 'pending',
      priorityScore: 0,
      lastAttemptAt: null,
    });
  });

  const roadmaps = await buildAllSubjectRoadmaps(userId, exam);

  if (chapterMap.size === 0) return { ...emptyPlanner(), roadmaps };
  const chapterIds = Array.from(chapterMap.keys());

  const [questionRows, attemptRows] = await Promise.all([
    fetchAllPaginated<any>(() =>
      supabase
        .from('questions')
        .select('id, chapter_id')
        .in('chapter_id', chapterIds)
        .or('is_active.is.null,is_active.eq.true'),
    ),
    fetchAllPaginated<any>(() =>
      supabase
        .from('question_attempts')
        .select('question_id, is_correct, attempted_at, question:questions!inner(chapter_id)')
        .eq('user_id', userId)
        .in('question.chapter_id', chapterIds),
    ),
  ]);

  questionRows.forEach((q) => {
    const chapterId = q.chapter_id;
    const metric = chapterId ? chapterMap.get(chapterId) : null;
    if (metric) metric.totalQuestions += 1;
  });

  const wrongByChapter = new Map<string, Set<string>>();
  const correctedByChapter = new Map<string, Set<string>>();

  attemptRows.forEach((attempt) => {
    const chapterId = attempt.question?.chapter_id;
    const metric = chapterId ? chapterMap.get(chapterId) : null;
    if (!metric) return;
    metric.attempts += 1;
    if (attempt.is_correct) {
      metric.correct += 1;
      if (!correctedByChapter.has(chapterId)) correctedByChapter.set(chapterId, new Set());
      if (attempt.question_id) correctedByChapter.get(chapterId)!.add(attempt.question_id);
    } else {
      metric.wrong += 1;
      if (!wrongByChapter.has(chapterId)) wrongByChapter.set(chapterId, new Set());
      if (attempt.question_id) wrongByChapter.get(chapterId)!.add(attempt.question_id);
    }
    if (!metric.lastAttemptAt || new Date(attempt.attempted_at || 0).getTime() > new Date(metric.lastAttemptAt || 0).getTime()) {
      metric.lastAttemptAt = attempt.attempted_at || null;
    }
  });

  const roadmapMetricById = new Map<string, ChapterMetric>();
  roadmaps.forEach((roadmap) => {
    roadmap.chapters.forEach((chapter) => roadmapMetricById.set(chapter.id, metricFromRoadmapChapter(chapter)));
  });

  const chapters = Array.from(chapterMap.values())
    .map((metric) => {
      const roadmapMetric = roadmapMetricById.get(metric.id);
      const wrongSet = wrongByChapter.get(metric.id) || new Set<string>();
      const correctedSet = correctedByChapter.get(metric.id) || new Set<string>();
      const pendingMistakes = roadmapMetric?.pendingMistakes ?? [...wrongSet].filter((questionId) => !correctedSet.has(questionId)).length;
      const accuracy = roadmapMetric?.accuracy ?? (metric.attempts > 0 ? Math.round((metric.correct / metric.attempts) * 100) : 0);
      let status: ChapterStatus = 'pending';
      if (roadmapMetric?.status === 'done' || (metric.attempts >= 20 && accuracy >= 80 && pendingMistakes === 0)) status = 'done';
      else if (metric.attempts > 0 && accuracy < 60) status = 'weak';
      else if (metric.attempts > 0 && accuracy < 80) status = 'medium';
      else if (metric.attempts > 0) status = 'strong';
      const priorityScore =
        (status === 'weak' ? 120 : status === 'medium' ? 70 : status === 'pending' ? 45 : 20) +
        pendingMistakes * 8 +
        Math.max(0, 15 - metric.attempts) +
        Math.min(30, daysSince(metric.lastAttemptAt));
      return { ...metric, pendingMistakes, accuracy, status, priorityScore };
    })
    .sort((a, b) => {
      const subjectDiff = canonicalSubjects.indexOf(a.subject) - canonicalSubjects.indexOf(b.subject);
      if (subjectDiff !== 0) return subjectDiff;
      return (a.chapterNumber || 999) - (b.chapterNumber || 999);
    });

  const bySubject = canonicalSubjects.reduce<Record<string, ChapterMetric[]>>((acc, subject) => {
    acc[subject] = chapters.filter((chapter) => chapter.subject === subject);
    return acc;
  }, {});

  const weak = chapters.filter((chapter) => chapter.status === 'weak').sort((a, b) => b.priorityScore - a.priorityScore);
  const medium = chapters.filter((chapter) => chapter.status === 'medium').sort((a, b) => b.priorityScore - a.priorityScore);
  const strong = chapters.filter((chapter) => chapter.status === 'strong' || chapter.status === 'done').sort((a, b) => b.priorityScore - a.priorityScore);
  const pending = chapters.filter((chapter) => chapter.status === 'pending');
  const active = chapters.find((chapter) => chapter.status !== 'done') || null;
  const next = chapters.find((chapter) => chapter.status === 'pending' && chapter.id !== active?.id) || null;
  const totalAttempts = chapters.reduce((sum, chapter) => sum + chapter.attempts, 0);
  const totalCorrect = chapters.reduce((sum, chapter) => sum + chapter.correct, 0);
  const seed = {
    roadmaps,
    chapters,
    bySubject,
    weak,
    medium,
    strong,
    pending,
    active,
    next,
    coveragePct: chapters.length ? Math.round(((chapters.length - pending.length) / chapters.length) * 100) : 0,
    totalQuestions: chapters.reduce((sum, chapter) => sum + chapter.totalQuestions, 0),
    totalAttempts,
    overallAccuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    pendingMistakes: chapters.reduce((sum, chapter) => sum + chapter.pendingMistakes, 0),
  };

  return { ...seed, weekly: buildWeeklyPlan(seed) };
}

export default function AIStudyPlanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getExamDate } = useExamDates();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [targetExam, setTargetExam] = useState<ExamKey>('JEE');
  const [planner, setPlanner] = useState<PlannerData>(emptyPlanner());
  const [completedHashes, setCompletedHashes] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState(0);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const cachedGoal = (() => {
        try {
          const raw = safeLocalStorage.getItem('userGoals');
          return raw ? normalizeTargetExam(JSON.parse(raw)?.goal) : null;
        } catch {
          return null;
        }
      })();

      const { data: profData, error: profError } = await supabase
        .from('my_profile' as any)
        .select('*')
        .maybeSingle();
      if (profError) logger.warn('Planner profile load warning', profError);

      const prof = (profData as any) || { target_exam: cachedGoal || 'JEE' };
      const exam = normalizeExam(normalizeTargetExam(prof?.target_exam || cachedGoal || 'JEE'));
      const data = await loadPlannerData(user.id, exam);

      const sevenAgo = new Date();
      sevenAgo.setDate(sevenAgo.getDate() - 6);
      const { data: progressRows } = await supabase
        .from('study_plan_progress')
        .select('plan_date, task_hash')
        .eq('user_id', user.id)
        .gte('plan_date', sevenAgo.toISOString().split('T')[0]);

      const done = new Set<string>();
      (progressRows || []).forEach((row: any) => {
        if (row?.task_hash) done.add(row.task_hash);
      });

      setProfile(prof);
      setTargetExam(exam);
      setPlanner(data);
      setCompletedHashes(done);
    } catch (error) {
      logger.error('Planner load error', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const examDate = profile?.target_exam_date || getExamDateForGrade(getExamDate(targetExam as any), profile?.grade);
  const daysToExam = getDaysUntilDate(examDate) ?? 365;
  const todayTasks = planner.weekly[0]?.tasks || [];
  const todayDone = todayTasks.filter((task) => completedHashes.has(taskHash(task))).length;
  const adherence = todayTasks.length > 0 ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const currentDay = planner.weekly[selectedDay] || planner.weekly[0];

  const subjectCoverage = useMemo(() => {
    return subjectsForExam(targetExam).map((subject) => {
      const list = planner.bySubject[subject] || [];
      const touched = list.filter((chapter) => chapter.attempts > 0).length;
      return { subject, total: list.length, touched, pct: list.length ? Math.round((touched / list.length) * 100) : 0 };
    });
  }, [planner.bySubject, targetExam]);

  const toggleDone = async (task: PlannerTask) => {
    if (!user?.id) return;
    const hash = taskHash(task);
    const next = new Set(completedHashes);
    if (next.has(hash)) {
      next.delete(hash);
      setCompletedHashes(next);
      await supabase
        .from('study_plan_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('plan_date', task.date)
        .eq('task_hash', hash);
    } else {
      next.add(hash);
      setCompletedHashes(next);
      await supabase.from('study_plan_progress').upsert(
        {
          user_id: user.id,
          plan_date: task.date,
          task_hash: hash,
          task_label: `${task.title} · ${task.chapter}`,
          chapter_id: task.chapterId || null,
          milestone: task.type,
          status: 'done',
          last_synced_at: new Date().toISOString(),
        } as any,
        { onConflict: 'user_id,plan_date,task_hash' },
      );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Tera mentor plan ready kar raha hu…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-3 pb-24">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Sparkles className="h-5 w-5 text-primary" /> AI Study Planner
          </h1>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground sm:text-xs">
            Scratch se syllabus cover karwaunga — weakness bhi strength banegi.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadAll()} className="shrink-0">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Mentor Next Step</p>
              <h2 className="truncate text-base font-extrabold leading-tight">
                {planner.active ? planner.active.title : 'Syllabus roadmap ready'}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {planner.active
                  ? `${formatSubjectDisplay(planner.active.subject)} · ${planner.active.attempts} attempts · ${planner.active.accuracy}% accuracy`
                  : 'All active chapters are clear. Revision mode on.'}
              </p>
            </div>
            {planner.active && (
              <Button size="sm" onClick={() => navigate(buildPracticeHref(planner.active!, planner.active!.status === 'weak' ? 'drill' : 'learn'))}>
                Start <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div>
              <Calendar className="mx-auto mb-0.5 h-4 w-4 text-primary" />
              <p className="text-sm font-bold">{daysToExam}</p>
              <p className="text-[9px] text-muted-foreground">Days</p>
            </div>
            <div>
              <Target className="mx-auto mb-0.5 h-4 w-4 text-primary" />
              <p className="text-sm font-bold">{planner.overallAccuracy}%</p>
              <p className="text-[9px] text-muted-foreground">Accuracy</p>
            </div>
            <div>
              <Flame className="mx-auto mb-0.5 h-4 w-4 text-primary" />
              <p className="text-sm font-bold">{planner.coveragePct}%</p>
              <p className="text-[9px] text-muted-foreground">Coverage</p>
            </div>
            <div>
              <Trophy className="mx-auto mb-0.5 h-4 w-4 text-primary" />
              <p className="text-sm font-bold">{adherence}%</p>
              <p className="text-[9px] text-muted-foreground">Today</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="roadmap" className="w-full">
        <TabsList className="grid h-9 w-full grid-cols-3">
          <TabsTrigger value="roadmap" className="text-xs">Roadmap</TabsTrigger>
          <TabsTrigger value="week" className="text-xs">This Week</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="roadmap" className="mt-3 space-y-3">
          {user?.id && <RoadmapView userId={user.id} exam={targetExam} initialRoadmaps={planner.roadmaps} onRefresh={loadAll} />}
        </TabsContent>

        <TabsContent value="week" className="mt-3 space-y-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {planner.weekly.map((day, index) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(index)}
                className={`min-w-[64px] rounded-xl border p-2 text-center transition-all ${selectedDay === index ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-card'}`}
              >
                <p className="text-[10px] font-bold text-muted-foreground">{day.dayName}</p>
                <p className="text-base font-extrabold">{day.tasks.length}</p>
                <p className="text-[9px] text-muted-foreground">{day.totalMinutes}m</p>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {(currentDay?.tasks || []).map((task) => {
              const done = completedHashes.has(taskHash(task));
              return (
                <Card key={task.id} className="border-border/70">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void toggleDone(task)}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${done ? 'border-emerald-500 bg-emerald-500/10' : 'border-border'}`}
                      >
                        {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <BookOpen className="h-4 w-4 text-primary" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold">{task.title}</p>
                          <Badge variant="outline" className="h-5 text-[9px]">{task.duration}m</Badge>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">{task.chapter} · {formatSubjectDisplay(task.subject)}</p>
                        <p className="line-clamp-1 text-[10px] text-muted-foreground">{task.subtitle}</p>
                      </div>
                      <Button size="sm" variant={done ? 'outline' : 'default'} className="h-8 shrink-0" onClick={() => navigate(task.href)}>
                        {task.actionLabel}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(!currentDay || currentDay.tasks.length === 0) && (
              <Card className="border-dashed">
                <CardContent className="p-5 text-center text-sm text-muted-foreground">DB data nahi mila. Refresh karke dobara try kar.</CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-red-200 bg-red-50/40 dark:bg-red-950/20">
              <CardContent className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <p className="text-[10px] font-bold uppercase">Weak now</p>
                </div>
                <p className="text-xl font-extrabold text-red-700">{planner.weak.length}</p>
                <p className="truncate text-[10px] text-muted-foreground">{planner.weak[0]?.title || 'No critical weakness'}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <CardContent className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-amber-700">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <p className="text-[10px] font-bold uppercase">Mistakes</p>
                </div>
                <p className="text-xl font-extrabold text-amber-700">{planner.pendingMistakes}</p>
                <p className="truncate text-[10px] text-muted-foreground">Pending wrong-question repair</p>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20">
              <CardContent className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-blue-700">
                  <Zap className="h-3.5 w-3.5" />
                  <p className="text-[10px] font-bold uppercase">Pending</p>
                </div>
                <p className="text-xl font-extrabold text-blue-700">{planner.pending.length}</p>
                <p className="truncate text-[10px] text-muted-foreground">Untouched chapters</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <p className="text-[10px] font-bold uppercase">Strong</p>
                </div>
                <p className="text-xl font-extrabold text-emerald-700">{planner.strong.length}</p>
                <p className="truncate text-[10px] text-muted-foreground">80%+ accuracy chapters</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3 p-3">
              <div>
                <p className="text-xs font-bold">Next chapter to finish</p>
                <p className="mt-0.5 text-sm font-semibold">{planner.active?.title || 'Revision mode'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {planner.active ? `${formatSubjectDisplay(planner.active.subject)} · ${planner.active.accuracy}% accuracy · ${planner.active.totalQuestions} questions available` : 'All roadmap chapters touched.'}
                </p>
              </div>
              {planner.next && (
                <div>
                  <p className="text-xs font-bold">After that</p>
                  <p className="mt-0.5 text-sm font-semibold">{planner.next.title}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-3">
              <p className="text-xs font-bold">Coverage by subject</p>
              {subjectCoverage.map((item) => (
                <div key={item.subject} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold">{formatSubjectDisplay(item.subject)}</span>
                    <span className="text-muted-foreground">{item.touched}/{item.total} chapters</span>
                  </div>
                  <Progress value={item.pct} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>

          {planner.weak.length > 0 && (
            <Card className="border-primary/20">
              <CardContent className="p-3">
                <p className="mb-2 text-xs font-bold">Top weak chapters</p>
                <div className="space-y-1.5">
                  {planner.weak.slice(0, 4).map((chapter) => (
                    <button key={chapter.id} type="button" onClick={() => navigate(buildPracticeHref(chapter, 'drill'))} className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-2 text-left hover:border-primary/50">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{chapter.title}</span>
                        <span className="text-[10px] text-muted-foreground">{formatSubjectDisplay(chapter.subject)} · {chapter.attempts} attempts</span>
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{chapter.accuracy}%</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
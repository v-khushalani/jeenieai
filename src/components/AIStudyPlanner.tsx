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
  
  Target,
  Trophy,
  Zap,
  Rocket,
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
import MissionChain from '@/components/planner/MissionChain';
import {
  buildAllSubjectRoadmaps,
  examRelevanceValues,
  normalizeExam,
  subjectsForExam,
  type RoadmapChapter,
  type SubjectRoadmap,
} from '@/lib/roadmapEngine';
import safeLocalStorage from '@/utils/safeStorage';
import { readPlannerCache, writePlannerCache, isFresh } from '@/lib/plannerCache';

type ExamKey = 'JEE' | 'NEET' | 'Foundation';
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

export async function loadPlannerData(
  userId: string,
  exam: ExamKey,
  classLevel?: number | null,
): Promise<PlannerData> {
  const canonicalSubjects = subjectsForExam(exam);
  const subjectAliases = Array.from(new Set(canonicalSubjects.flatMap((subject) => getSubjectAliases(subject))));

  let chapterQuery = supabase
    .from('chapters')
    .select('id, subject, chapter_name, name, chapter_number, class_level')
    .eq('is_active', true)
    .in('subject', subjectAliases)
    .overlaps('exam_relevance', examRelevanceValues(exam))
    .order('subject', { ascending: true })
    .order('class_level', { ascending: true, nullsFirst: false })
    .order('chapter_number', { ascending: true, nullsFirst: false })
    .limit(260);
  // Foundation: strict per-grade isolation (Class 7 sees only Class 7 chapters, etc.)
  if (exam === 'Foundation' && typeof classLevel === 'number') {
    chapterQuery = chapterQuery.eq('class_level', classLevel);
  } else if (classLevel === 11 || classLevel === 12) {
    // Class 11/12 students: only their own year (plus untagged chapters).
    chapterQuery = chapterQuery.or(`class_level.eq.${classLevel},class_level.is.null`);
  }
  const { data: chapterRows, error: chapterError } = await chapterQuery;


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

  const roadmaps = await buildAllSubjectRoadmaps(userId, exam, classLevel);

  if (chapterMap.size === 0) return { ...emptyPlanner(), roadmaps };
  const chapterIds = Array.from(chapterMap.keys());

  const [countRows, attemptRows] = await Promise.all([
    supabase
      .rpc('get_chapter_question_counts', { p_chapter_ids: chapterIds })
      .then(({ data }) => (data as any[]) || []),
    fetchAllPaginated<any>(() =>
      supabase
        .from('question_attempts')
        .select('question_id, is_correct, attempted_at, question:questions!inner(chapter_id)')
        .eq('user_id', userId)
        .in('question.chapter_id', chapterIds),
    ),
  ]);

  countRows.forEach((row: any) => {
    const metric = row?.chapter_id ? chapterMap.get(row.chapter_id) : null;
    if (metric) metric.totalQuestions = Number(row.count) || 0;
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
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [targetExam, setTargetExam] = useState<ExamKey>('JEE');
  const [planner, setPlanner] = useState<PlannerData>(emptyPlanner());
  const [completedHashes, setCompletedHashes] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState(0);
  const [signal, setSignal] = useState<any>(null);


  const loadAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user?.id) return;
    const silent = !!opts?.silent;
    if (silent) setRefreshing(true);
    else setLoading(true);
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
      const gradeNum = Number(prof?.grade);
      const classLevel = Number.isFinite(gradeNum) && gradeNum >= 6 && gradeNum <= 12 ? gradeNum : null;
      const exam = normalizeExam(normalizeTargetExam(prof?.target_exam || cachedGoal || 'JEE'), classLevel);
      const data = await loadPlannerData(user.id, exam, classLevel);


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

      // Fetch coach signal (streak, etc.)
      supabase.functions.invoke('compute-coach-signal').then(({ data: sigData }) => {
        if (sigData) setSignal(sigData);
      }).catch(() => {});

      writePlannerCache(user.id, { profile: prof, targetExam: exam, planner: data, completedHashes: Array.from(done) });
    } catch (error) {
      logger.error('Planner load error', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Cache-first render: hydrate from cache instantly, then refresh in background.
  useEffect(() => {
    if (!user?.id) return;
    const cached = readPlannerCache<any>(user.id);
    if (cached?.data?.planner) {
      setProfile(cached.data.profile);
      setTargetExam(cached.data.targetExam || 'JEE');
      setPlanner(cached.data.planner);
      setCompletedHashes(new Set(cached.data.completedHashes || []));
      setLoading(false);
      // Refresh in background if stale
      if (!isFresh(cached.ageMs)) void loadAll({ silent: true });
    } else {
      void loadAll();
      // Watchdog: never block the full page more than 6s on a cold load.
      // Drop out of the blocking loader and let the empty/partial state render;
      // the background fetch will hydrate real data as soon as it lands.
      const watchdog = window.setTimeout(() => setLoading(false), 6000);
      return () => window.clearTimeout(watchdog);
    }
  }, [user?.id, loadAll]);

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
          <p className="text-sm text-muted-foreground">JEEnie's getting it ready for you…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-3 pb-24">
      {/* Dynamic Header */}
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-black sm:text-2xl tracking-tighter uppercase italic text-primary">
            <Rocket className="h-6 w-6" /> JEEnie AI Planner
          </h1>
          <p className="mt-0.5 line-clamp-2 text-[11px] font-bold text-muted-foreground sm:text-xs">
            Scratch se syllabus cover karwaunga — weakness bhi strength banegi.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button 
            variant="ghost" 
            size="icon" 
            className={`h-9 w-9 rounded-xl border-2 transition-all ${refreshing ? 'animate-spin' : 'hover:scale-110'}`} 
            onClick={() => void loadAll()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <MissionChain />

      {/* My Journey — collapsed, never competes with today's action */}
      {user?.id && (
        <details className="rounded-2xl border-2 border-border/60 bg-card px-3 py-2.5">
          <summary className="cursor-pointer flex items-center gap-2 text-xs font-black uppercase tracking-tighter">
            <Rocket className="w-4 h-4 text-primary" /> My Journey
          </summary>
          <div className="mt-3">
            <RoadmapView
              userId={user.id}
              exam={targetExam}
              classLevel={(() => {
                const g = Number((profile as any)?.grade);
                return Number.isFinite(g) && g >= 6 && g <= 12 ? g : null;
              })()}
              initialRoadmaps={planner.roadmaps}
              xpPoints={planner.totalAttempts * 10 + planner.coveragePct * 5}
              streak={signal?.streak?.current || 0}
              onRefresh={loadAll}
            />
          </div>
        </details>
      )}

    </div>
  );
}

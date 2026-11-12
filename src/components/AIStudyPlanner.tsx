import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Flame, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useExamDates } from '@/hooks/useExamDates';
import { normalizeTargetExam } from '@/config/goalConfig';
import { getDaysUntilDate, getExamDateForGrade } from '@/utils/examTimeline';
import { logger } from '@/utils/logger';
import { getSubjectAliases, normalizeSubject } from '@/lib/subjectNormalization';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import CoachHorizons from '@/components/planner/CoachHorizons';
import MissionCoach from '@/components/planner/MissionCoach';
import type { MissionAttempt, MissionTest, MissionInput } from '@/lib/missionEngine';
import { plannerToday, readPreferences, readEvidence, type PlannerPreferences } from '@/lib/plannerState';
import { getRepairedIds } from '@/lib/mistakeRepair';
import { motion, AnimatePresence } from 'framer-motion';

import {
  buildAllSubjectRoadmaps,
  examRelevanceValues,
  normalizeExam,
  subjectsForExam,
  type RoadmapChapter,
  type SubjectRoadmap,
} from '@/lib/roadmapEngine';
import safeLocalStorage from '@/utils/safeStorage';
import { readPlannerCache, writePlannerCache } from '@/lib/plannerCache';

type ExamKey = 'JEE' | 'NEET' | 'Foundation';
type ChapterStatus = 'pending' | 'weak' | 'medium' | 'strong' | 'done';
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
  todayAttempts?: number;
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
  coveragePct: number;
  totalQuestions: number;
  totalAttempts: number;
  overallAccuracy: number;
  pendingMistakes: number;
  attempts?: MissionAttempt[];
  tests?: MissionTest[];
}

const daysSince = (iso: string | null) => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)) : 99;

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

  const testsSince = new Date(Date.now() - 21 * 864e5).toISOString();
  const [countRows, attemptRows, testRows] = await Promise.all([
    supabase
      .rpc('get_chapter_question_counts', { p_chapter_ids: chapterIds })
      .then(({ data, error }) => { if (error) throw error; return (data as any[]) || []; }),
    fetchAllPaginated<any>(() =>
      supabase
        .from('question_attempts')
        .select('question_id, is_correct, attempted_at, time_spent, test_session_id, question:questions!inner(chapter_id)')
        .eq('user_id', userId)
        .in('question.chapter_id', chapterIds),
    ),
    supabase
      .from('test_sessions')
      .select('id, title, completed_at, total_questions, attempted_questions')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', testsSince)
      .order('completed_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => { if (error) throw error; return (data as any[]) || []; }),
  ]);

  const missionAttempts: MissionAttempt[] = attemptRows
    .filter((a) => a.question?.chapter_id && a.attempted_at)
    .map((a) => ({
      chapterId: a.question.chapter_id,
      isCorrect: !!a.is_correct,
      timeSec: typeof a.time_spent === 'number' ? a.time_spent : null,
      at: new Date(a.attempted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
      testSessionId: a.test_session_id || null,
    }));
  const missionTests: MissionTest[] = testRows
    .filter((t) => t.completed_at)
    .map((t) => ({
      id: t.id,
      title: t.title || 'Test',
      completedAt: new Date(t.completed_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
      totalQuestions: Number(t.total_questions) || 0,
      attempted: Number(t.attempted_questions) || 0,
      isFullMock: /full.*(?:mock|syllabus)|pyq mock/i.test(t.title || ''),
    }));

  countRows.forEach((row: any) => {
    const metric = row?.chapter_id ? chapterMap.get(row.chapter_id) : null;
    if (metric) metric.totalQuestions = Number(row.count) || 0;
  });

  const istTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istWeekStart = (() => {
    const t = new Date(istTodayStr + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  })();
  const wrongByChapter = new Map<string, Set<string>>();
  const correctedByChapter = new Map<string, Set<string>>();

  attemptRows.forEach((attempt) => {
    const chapterId = attempt.question?.chapter_id;
    const metric = chapterId ? chapterMap.get(chapterId) : null;
    if (!metric) return;
    metric.attempts += 1;
    if (attempt.attempted_at) {
      const d = new Date(attempt.attempted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (d === istTodayStr) metric.todayAttempts = (metric.todayAttempts || 0) + 1;
      if (d >= istWeekStart) (metric as any).weekAttempts = ((metric as any).weekAttempts || 0) + 1;
    }
    if (attempt.is_correct) {
      metric.correct += 1;
      if (!correctedByChapter.has(chapterId)) correctedByChapter.set(chapterId, new Set());
      if (attempt.question_id) correctedByChapter.get(chapterId)?.add(attempt.question_id);
    } else {
      metric.wrong += 1;
      if (!wrongByChapter.has(chapterId)) wrongByChapter.set(chapterId, new Set());
      if (attempt.question_id) wrongByChapter.get(chapterId)?.add(attempt.question_id);
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
      const repaired = getRepairedIds(userId);
      const pendingMistakes = [...wrongSet].filter((questionId) => !correctedSet.has(questionId) && !repaired.has(questionId)).length;
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

  return { ...seed, attempts: missionAttempts, tests: missionTests };
}

export default function AIStudyPlanner() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view = viewParam === 'week' || viewParam === 'plan' ? viewParam : 'today';
  const [preferences, setPreferences] = useState<PlannerPreferences>(() => readPreferences(user?.id || 'anon'));
  const { getExamDate } = useExamDates();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [targetExam, setTargetExam] = useState<ExamKey>('JEE');
  const [planner, setPlanner] = useState<PlannerData>(emptyPlanner());
  const [loadError, setLoadError] = useState(false);
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


      setProfile(prof);
      setTargetExam(exam);
      setPlanner(data);
      setLoadError(false);

      // Fetch coach signal (streak, etc.)
      supabase.functions.invoke('compute-coach-signal').then(({ data: sigData }) => {
        if (sigData) setSignal(sigData);
      }).catch(() => {});

      writePlannerCache(user.id, { profile: prof, targetExam: exam, planner: data, completedHashes: [] });
    } catch (error) {
      logger.error('Planner load error', error);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { if (user?.id) setPreferences(readPreferences(user.id)); }, [user?.id]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void loadAll({ silent: true }); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadAll]);

  // Cache-first render: hydrate from cache instantly, then refresh in background.
  useEffect(() => {
    if (!user?.id) return;
    const cached = readPlannerCache<any>(user.id);
    if (cached?.data?.planner) {
      setProfile(cached.data.profile);
      setTargetExam(cached.data.targetExam || 'JEE');
      setPlanner(cached.data.planner);

      setLoading(false);
      // Refresh in background if stale
      void loadAll({ silent: true });
    } else {
      void loadAll();
      // Watchdog: never block the full page more than 6s on a cold load.
      // Drop out of the blocking loader and let the empty/partial state render;
      // the background fetch will hydrate real data as soon as it lands.
      const watchdog = window.setTimeout(() => setLoading(false), 6000);
      return () => window.clearTimeout(watchdog);
    }
  }, [user?.id, loadAll]);

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

  const daysLeft = (() => {
    const g = Number((profile as any)?.grade);
    const d = getDaysUntilDate(getExamDateForGrade(getExamDate(targetExam), Number.isFinite(g) ? g : null));
    if (d) return d;
    const base = new Date(getExamDate(targetExam));
    if (Number.isNaN(base.getTime())) return null;
    while (base.getTime() < Date.now()) base.setFullYear(base.getFullYear() + 1);
    return getDaysUntilDate(base.toISOString().slice(0, 10));
  })();
  const VIEWS = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'plan', label: 'Overview' },
  ] as const;

  const today = plannerToday();
  const weekend = [0, 6].includes(new Date(today + 'T00:00:00Z').getUTCDay());
  const input: MissionInput = {
    exam: targetExam, daysLeft: daysLeft ?? 0,
    grade: Number.isFinite(Number(profile?.grade)) ? Number(profile?.grade) : null,
    chapters: planner.chapters, attempts: planner.attempts || [], tests: planner.tests || [], todayIso: today,
    cohortOverride: preferences.cohort,
    availableMinutes: weekend ? preferences.weekendMinutes : preferences.weekdayMinutes,
    coachingChapterIds: preferences.coaching, backlogChapterId: preferences.backlogId,
    completedTaskIds: Object.entries(readEvidence(user?.id || 'anon')).filter(([, e]) => e.reviewed).map(([id]) => id),
  };

  return (
    <div className="space-y-5 py-3 pb-24">
      <div className="flex items-center justify-between gap-2 px-1">
        <h1 className="text-xl font-extrabold tracking-normal">JEEnie Coach</h1>
        <div className="flex items-center gap-2">
          {(signal?.streak?.current || 0) > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
              <Flame className="h-3.5 w-3.5 text-primary" /> {signal?.streak?.current}
            </span>
          )}
          <Button variant="ghost" size="icon" aria-label="Refresh planner" className="h-9 w-9 rounded-2xl" onClick={() => void loadAll()}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div role="tablist" aria-label="Planner views" className="relative mx-auto grid h-11 max-w-3xl grid-cols-3 rounded-md bg-muted/60 p-1">
        {VIEWS.map((v) => (
          <Button variant="ghost" role="tab" aria-selected={view === v.id}
            key={v.id}
            onClick={() => setSearchParams({ view: v.id })}
            className={`relative z-10 rounded-xl text-xs font-bold transition-colors ${view === v.id ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {view === v.id && (
              <motion.span layoutId="coach-seg" className="absolute inset-0 -z-10 rounded-xl bg-background shadow-sm" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
            )}
            {v.label}
          </Button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
          {loadError && <p role="alert" className="mb-4 text-sm text-muted-foreground">Could not refresh your plan. Try refresh; any saved plan may be out of date.</p>}
          {daysLeft === null ? <p className="py-8 text-sm text-muted-foreground">Set your target exam date to create a plan.</p> : view === 'today' ? (
            <MissionCoach userId={user?.id || 'anon'} input={input} preferences={preferences} onPreferences={setPreferences} />
          ) : <CoachHorizons view={view} input={input} preferences={preferences} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

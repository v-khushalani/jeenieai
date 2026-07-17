import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, ArrowRight, CheckCircle, XCircle, Loader2,
  Target, Trophy, BookOpen, RotateCcw, Zap, Lock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MathDisplay } from '@/components/admin/MathDisplay';
import { logger } from '@/utils/logger';
import { QuestionReportDialog, ReportButton } from '@/components/QuestionReportDialog';
import { UserLimitsService } from '@/services/userLimitsService';
import { useRegisterJeenieQuestion } from '@/lib/currentQuestionStore';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { mapBatchToExamField } from '@/utils/batchQueryBuilder';
import 'katex/dist/katex.min.css';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import StudyNotesPanel from '@/components/study/StudyNotesPanel';
import StudyNotesIntro from '@/components/study/StudyNotesIntro';

import confetti from 'canvas-confetti';

interface Question {
  id: string;
  question: string;
  question_text?: string | null;
  question_image_url?: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  options?: unknown;
  correct_options?: string[] | null;
  exam?: string | null;
  difficulty?: string;
  question_type?: string | null;
  numerical_answer?: number | null;
  numerical_tolerance?: number | null;
  topic?: string;
  topic_id?: string;
  chapter?: string;
  subject?: string;
  is_pyq?: boolean | null;
  pyq_exam?: string | null;
  pyq_year?: number | null;
  pyq_session?: string | null;
}

interface AnswerRecord {
  selectedOption: string; // joined letters for multi, "NUM:<value>" for numerical
  isCorrect: boolean;
  correctOption: string; // joined letters or numeric string for display
  explanation: string;
}

const OPTIONS = ['A', 'B', 'C', 'D'] as const;
const QUESTIONS_PER_BATCH = 50;
const AUTO_ADVANCE_DELAY = 800;

// ── Adaptive difficulty (ELO-inspired) ──────────────────────────────
// Single source of truth: a question's `difficulty` field from the DB.
// `difficultyScore` accumulates based on actual question difficulty + outcome,
// and `currentDifficulty` (derived) decides what to fetch next.
type Difficulty = 'Easy' | 'Medium' | 'Hard';

const DIFFICULTY_THRESHOLDS = { easy: 30, hard: 65 } as const;
const SCORE_DELTAS: Record<Difficulty, { correct: number; wrong: number }> = {
  Easy:   { correct: 5,  wrong: -15 },
  Medium: { correct: 10, wrong: -10 },
  Hard:   { correct: 15, wrong: -5 },
};
const POINTS_FOR_CORRECT: Record<Difficulty, number> = { Easy: 5, Medium: 10, Hard: 15 };
const POINTS_FOR_WRONG = -2;

function normalizeDifficulty(d?: string | null): Difficulty {
  const v = (d || '').toLowerCase();
  if (v === 'easy') return 'Easy';
  if (v === 'hard') return 'Hard';
  return 'Medium';
}

function getDifficultyFromScore(score: number): Difficulty {
  if (score < DIFFICULTY_THRESHOLDS.easy) return 'Easy';
  if (score > DIFFICULTY_THRESHOLDS.hard) return 'Hard';
  return 'Medium';
}

function getPointsDelta(difficulty: string | undefined | null, isCorrect: boolean): number {
  if (!isCorrect) return POINTS_FOR_WRONG;
  return POINTS_FOR_CORRECT[normalizeDifficulty(difficulty)];
}

function getLevelFromPoints(totalPoints: number): string {
  if (totalPoints <= 1000) return 'BEGINNER';
  if (totalPoints <= 3000) return 'LEARNER';
  if (totalPoints <= 7000) return 'ACHIEVER';
  if (totalPoints <= 20000) return 'EXPERT';
  if (totalPoints <= 50000) return 'MASTER';
  return 'LEGEND';
}

function getLevelProgress(totalPoints: number): number {
  if (totalPoints <= 1000) return (totalPoints / 1000) * 100;
  if (totalPoints <= 3000) return ((totalPoints - 1001) / 1999) * 100;
  if (totalPoints <= 7000) return ((totalPoints - 3001) / 3999) * 100;
  if (totalPoints <= 20000) return ((totalPoints - 7001) / 12999) * 100;
  if (totalPoints <= 50000) return ((totalPoints - 20001) / 29999) * 100;
  return 100;
}


// Order a pool of questions so the user always sees their target difficulty
// first, with lower/higher levels following naturally. Within each bucket
// we still randomize so the order isn't predictable.
function orderPoolByLevel<T extends { difficulty?: string | null }>(pool: T[], target: Difficulty): T[] {
  const buckets: Record<Difficulty, T[]> = { Easy: [], Medium: [], Hard: [] };
  pool.forEach((q) => buckets[normalizeDifficulty(q.difficulty)].push(q));
  (['Easy', 'Medium', 'Hard'] as Difficulty[]).forEach((k) => buckets[k].sort(() => Math.random() - 0.5));
  const order: Difficulty[] =
    target === 'Easy' ? ['Easy', 'Medium', 'Hard']
    : target === 'Hard' ? ['Hard', 'Medium', 'Easy']
    : ['Medium', 'Easy', 'Hard'];
  return order.flatMap((k) => buckets[k]);
}


const getExamFilter = (exam?: string | null, grade?: number | null) => {
  if (!exam) return null;
  const lower = exam.toLowerCase();
  if (lower.includes('neet')) return 'NEET';
  if (lower.includes('jee')) return 'JEE';
  if (exam.startsWith('Foundation')) return 'Foundation';
  if (grade && grade <= 10) return 'Foundation';
  return exam;
};

const PracticePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const subject = searchParams.get('subject') || '';
  const chapter = searchParams.get('chapter') || '';
  const chapterId = searchParams.get('chapter_id') || '';
  const topicId = searchParams.get('topic_id') || searchParams.get('topic') || '';
  const topicName = searchParams.get('topic') || '';
  const topicFilterName = /^[0-9a-f-]{20,}$/i.test(topicName) ? '' : topicName.trim();
  const mode = (searchParams.get('mode') || '').toLowerCase();
  const isRevisit = mode === 'revision' || mode === 'weak';
  const missionId = searchParams.get('mission_id') || '';
  const blockId = searchParams.get('block_id') || '';
  const targetParam = parseInt(searchParams.get('target') || '', 10);
  const missionTarget = Number.isFinite(targetParam) && targetParam > 0 ? targetParam : 0;
  const isMissionBlock = !!(missionId && blockId && missionTarget > 0);
  const studyNotesEnabled = useFeatureFlag('study_notes');


  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [stats, setStats] = useState({ correct: 0, wrong: 0, total: 0 });

  // Daily limit state
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [dailyRemaining, setDailyRemaining] = useState<number>(Infinity);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(15);
  const [dailyGoalForStreak, setDailyGoalForStreak] = useState(15);
  const [todayPracticeCount, setTodayPracticeCount] = useState(0);

  // Per-question answer storage
  const [answeredQuestions, setAnsweredQuestions] = useState<Map<number, AnswerRecord>>(new Map());

  // Adaptive difficulty — ELO score
  const [difficultyScore, setDifficultyScore] = useState(15);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const currentDifficulty = getDifficultyFromScore(difficultyScore);

  // Auto-advance
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reportingQuestionId, setReportingQuestionId] = useState<string | null>(null);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [numericalInput, setNumericalInput] = useState('');

  const currentAnswer = answeredQuestions.get(currentIndex) || null;
  const isCurrentAnswered = currentAnswer !== null;

  // Reset transient inputs when question changes
  useEffect(() => {
    setMultiSelected(new Set());
    setNumericalInput('');
  }, [currentIndex]);

  // Check daily limit on mount and after each answer
  const checkDailyLimit = useCallback(async () => {
    if (!user?.id) return;
    try {
      const result = await UserLimitsService.canSolveMore(user.id);
      setDailyLimitReached(!result.canSolve);
      setDailyRemaining(result.remaining);
      setDailyUsed(result.used);
      setDailyLimit(result.limit === Infinity ? 999 : result.limit);
    } catch (e) {
      logger.error('Error checking daily limit:', e);
    }
  }, [user?.id]);

  useEffect(() => { checkDailyLimit(); }, [checkDailyLimit]);

  const getISTDateString = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
  };

  const refreshStreakProgress = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = getISTDateString();
      const [{ data: progressRows }, { data: profileData }] = await Promise.all([
        supabase
          .from('daily_progress')
          .select('questions_completed')
          .eq('user_id', user.id)
          .eq('date', today)
          .order('updated_at', { ascending: false })
          .limit(1),
        supabase
          .from('profiles')
          .select('daily_goal')
          .eq('id', user.id)
          .single(),
      ]);

      setDailyGoalForStreak(profileData?.daily_goal || 15);
      setTodayPracticeCount(progressRows?.[0]?.questions_completed || 0);
    } catch (e) {
      logger.error('Error loading streak progress:', e);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshStreakProgress();
  }, [refreshStreakProgress]);

  const updatePracticeStatsFallback = useCallback(async (isCorrect: boolean, pointsDelta: number) => {
    if (!user?.id) return;
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('total_points, total_questions_solved, overall_accuracy')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const prevPoints = Number(profile?.total_points || 0);
      const prevSolved = Number(profile?.total_questions_solved || 0);
      const prevAccuracy = Number(profile?.overall_accuracy || 0);

      const nextPoints = Math.max(0, prevPoints + pointsDelta);
      const nextSolved = prevSolved + 1;
      const nextAccuracy = nextSolved > 0
        ? Number((((prevAccuracy * prevSolved) + (isCorrect ? 100 : 0)) / nextSolved).toFixed(1))
        : 0;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          total_points: nextPoints,
          total_questions_solved: nextSolved,
          overall_accuracy: nextAccuracy,
          level: getLevelFromPoints(nextPoints),
          level_progress: Math.min(100, getLevelProgress(nextPoints)),
          last_activity: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) throw updateError;
    } catch (e) {
      logger.error('Fallback stats update failed:', e);
    }
  }, [user?.id]);

  const fetchQuestions = useCallback(async (_difficulty?: string) => {
    setLoading(true);
    try {
      // Resolve exam + batch filters from profile
      let examFilter: string | null = null;
      let userBatchIds: string[] = [];
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('target_exam, grade')
          .eq('id', user.id)
          .single();
        const profileExam = profile?.target_exam || 'JEE';
        examFilter = getExamFilter(profileExam, profile?.grade || 12) || mapBatchToExamField(profileExam, profile?.grade || 12);
        if (profile?.target_exam) {
          const { data: batches } = await supabase
            .from('batches')
            .select('id')
            .eq('exam_type', profile.target_exam)
            .eq('is_active', true);
          userBatchIds = (batches || []).map(b => b.id);
        }
      }

      const takeCount = isMissionBlock ? missionTarget : QUESTIONS_PER_BATCH;

      // Revisit mode: intentionally re-serve previously attempted questions in this scope
      if (isRevisit) {
        let q = supabase
          .from('questions')
          .select('id, question, question_text, question_image_url, option_a, option_b, option_c, option_d, options, correct_options, numerical_answer, numerical_tolerance, difficulty, question_type, topic, topic_id, chapter, subject, exam, is_pyq, pyq_exam, pyq_year, pyq_session')
          .or('is_active.is.null,is_active.eq.true');
        if (examFilter) q = q.eq('exam', examFilter);
        if (topicId) q = q.eq('topic_id', topicId);
        else if (chapterId) q = q.eq('chapter_id', chapterId);
        else if (subject) q = q.ilike('subject', subject);
        if (!topicId && topicFilterName) q = q.ilike('topic', `%${topicFilterName}%`);
        const { data, error } = await q.limit(500);
        if (error) throw error;
        const ordered = orderPoolByLevel(data || [], currentDifficulty).slice(0, takeCount);
        setQuestions(ordered);
        setLoading(false);
        return;
      }

      // Default: strict unseen-only via RPC (server-side NOT EXISTS on question_attempts)
      if (!user?.id) {
        setQuestions([]);
        setLoading(false);
        return;
      }

      // Fetch a wider pool than we need so difficulty ordering has room to pick from
      const rpcLimit = Math.max(takeCount * 4, 60);

      const buildRpcArgs = (opts: {
        useChapter?: boolean;
        useTopic?: boolean;
        useSubject?: boolean;
        useBatches?: boolean;
        useExam?: boolean;
      }) => ({
        p_user_id: user.id,
        p_exam: opts.useExam !== false ? examFilter : null,
        p_subject: opts.useSubject && subject ? subject : null,
        p_chapter_id: opts.useChapter && chapterId ? chapterId : null,
        p_topic_id: opts.useTopic && topicId ? topicId : null,
        p_topic_name: !topicId && topicFilterName ? topicFilterName : null,
        p_batch_ids: opts.useBatches && userBatchIds.length > 0 && !topicId && !chapterId ? userBatchIds : null,
        p_limit: rpcLimit,
      });

      // Primary: all filters on
      let { data: pool, error: rpcErr } = await supabase.rpc('fetch_unseen_questions', buildRpcArgs({
        useChapter: true, useTopic: true, useSubject: true, useBatches: true, useExam: true,
      }));
      if (rpcErr) throw rpcErr;

      // Fallback ladder: drop batch filter, then exam filter, then subject (only if no chapter/topic)
      if ((!pool || pool.length === 0) && userBatchIds.length > 0) {
        const r = await supabase.rpc('fetch_unseen_questions', buildRpcArgs({
          useChapter: true, useTopic: true, useSubject: true, useBatches: false, useExam: true,
        }));
        pool = r.data || [];
      }
      if ((!pool || pool.length === 0) && examFilter) {
        const r = await supabase.rpc('fetch_unseen_questions', buildRpcArgs({
          useChapter: true, useTopic: true, useSubject: true, useBatches: false, useExam: false,
        }));
        pool = r.data || [];
      }

      if (!pool || pool.length === 0) {
        toast.success("You've completed all questions in this section! 🎉 Try another topic.");
        setQuestions([]);
        setLoading(false);
        return;
      }

      const ordered = orderPoolByLevel(pool as Question[], currentDifficulty).slice(0, takeCount);
      setQuestions(ordered);
    } catch (error) {
      logger.error('Failed to fetch practice questions:', error);
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [subject, chapterId, topicId, user, chapter, topicFilterName, isRevisit, isMissionBlock, missionTarget]);

  // NOTE: currentDifficulty intentionally NOT in deps — order is recomputed in
  // orderPoolByLevel on next fetch instead of refetching mid-session, which would
  // corrupt index-keyed `answeredQuestions`.



  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  useEffect(() => {
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current); };
  }, []);

  const cancelAutoAdvance = () => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  };

  const startAutoAdvance = () => {
    autoAdvanceTimer.current = setTimeout(() => {
      handleNext();
    }, AUTO_ADVANCE_DELAY);
  };

  // Sync daily_progress table after each answer (via SECURITY DEFINER RPC)
  const syncDailyProgress = async (isCorrect: boolean, pointsDelta: number) => {
    if (!user?.id) return;
    try {
      const today = getISTDateString();

      const { data: profileData } = await supabase
        .from('profiles')
        .select('daily_goal')
        .eq('id', user.id)
        .single();
      const dailyGoal = profileData?.daily_goal || 15;
      setDailyGoalForStreak(dailyGoal);

      await supabase.rpc('sync_daily_progress', {
        p_user_id: user.id,
        p_is_correct: isCorrect,
        p_points_delta: Math.max(0, pointsDelta),
      });

      const { data: progressRows } = await supabase
        .from('daily_progress')
        .select('questions_completed')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('updated_at', { ascending: false })
        .limit(1);
      setTodayPracticeCount(progressRows?.[0]?.questions_completed ?? 0);
    } catch (e) {
      logger.error('Error syncing daily progress:', e);
    }
  };


  const submitAnswer = async (
    selectedLetters: string[],
    numericalValue: number | null,
    displaySelected: string,
  ) => {
    if (isCurrentAnswered || !user || isValidating) return;

    if (dailyLimitReached) {
      toast.error('Daily limit reached! View plans for unlimited questions.');
      return;
    }

    setIsValidating(true);
    cancelAutoAdvance();

    try {
      const currentQuestion = questions[currentIndex];
      const { data: rpcData, error: rpcError } = await supabase.rpc('validate_practice_answer', {
        p_question_id: currentQuestion.id,
        p_selected_options: selectedLetters.length > 0 ? selectedLetters : null,
        p_numerical_answer: numericalValue,
      } as any);
      if (rpcError) {
        logger.error('validate_practice_answer RPC error:', rpcError);
        toast.error(`Could not validate answer: ${rpcError.message || 'try again'}`);
        setIsValidating(false);
        return;
      }

      const result = rpcData as {
        is_correct: boolean;
        correct_options?: string[] | null;
        numerical_answer?: number | null;
        correct_option?: string | null;
        explanation?: string;
      } | null;

      if (result) {
        const explanation = result.explanation || 'No explanation available.';
        const correctDisplay = result.numerical_answer != null
          ? String(result.numerical_answer)
          : (result.correct_options && result.correct_options.length > 0
              ? result.correct_options.join(', ')
              : (result.correct_option || ''));

        const record: AnswerRecord = {
          selectedOption: displaySelected,
          isCorrect: result.is_correct,
          correctOption: correctDisplay,
          explanation,
        };

        setAnsweredQuestions(prev => new Map(prev).set(currentIndex, record));

        setStats(prev => ({
          correct: prev.correct + (result.is_correct ? 1 : 0),
          wrong: prev.wrong + (result.is_correct ? 0 : 1),
          total: prev.total + 1,
        }));

        const qDiff = normalizeDifficulty(currentQuestion.difficulty);
        const deltas = SCORE_DELTAS[qDiff];
        let scoreDelta = result.is_correct ? deltas.correct : deltas.wrong;

        const newConsecutive = result.is_correct ? consecutiveCorrect + 1 : 0;
        setConsecutiveCorrect(newConsecutive);
        if (result.is_correct && newConsecutive >= 5) {
          scoreDelta = Math.round(scoreDelta * 1.5);
        }

        const newScore = Math.max(0, Math.min(100, difficultyScore + scoreDelta));
        const oldDiff = getDifficultyFromScore(difficultyScore);
        const newDiff = getDifficultyFromScore(newScore);
        setDifficultyScore(newScore);

        if (newDiff !== oldDiff) {
          const isUp = newScore > difficultyScore - scoreDelta;
          toast(isUp ? `Level up → ${newDiff} 🔥` : `Adjusting → ${newDiff}`, { duration: 1500 });
        }

        const { error: attemptInsertError } = await supabase.from('question_attempts').insert({
          user_id: user.id,
          question_id: currentQuestion.id,
          selected_option: displaySelected,
          is_correct: result.is_correct,
          mode: 'practice',
          time_spent: 0,
        });
        if (attemptInsertError) throw attemptInsertError;

        const pointsDelta = getPointsDelta(currentQuestion.difficulty, result.is_correct);
        const [practiceStatsRes, streakRes, topicMasteryRes] = await Promise.all([
          supabase.rpc('update_practice_stats', {
            p_user_id: user.id,
            p_points_delta: pointsDelta,
            p_is_correct: result.is_correct,
          }),
          supabase.rpc('update_streak_stats', { p_user_id: user.id }),
          currentQuestion.topic_id
            ? supabase.rpc('upsert_topic_mastery', {
                p_user_id: user.id,
                p_topic_id: currentQuestion.topic_id,
                p_is_correct: result.is_correct,
              })
            : Promise.resolve({ error: null }),
        ]);

        await syncDailyProgress(result.is_correct, pointsDelta);

        // Bump mission block progress (idempotent server-side) — live-updates the planner.
        // If we have deep-link params → target that block. Otherwise auto-match by chapter_id
        // so practicing from Study Now / Roadmap also reflects in today's mission.
        try {
          const bumpRes = isMissionBlock
            ? await supabase.rpc('bump_mission_block_progress', {
                p_mission_id: missionId,
                p_block_id: blockId,
                p_is_correct: result.is_correct,
                p_question_id: currentQuestion.id,
              } as any)
            : chapterId
              ? await supabase.rpc('bump_mission_progress_by_chapter' as any, {
                  p_chapter_id: chapterId,
                  p_is_correct: result.is_correct,
                  p_question_id: currentQuestion.id,
                } as any)
              : { data: null, error: null };

          if ((bumpRes as any)?.data?.block_done) {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            toast.success('Mission block complete! 🎯 Planner updated.');
          }
        } catch (e) {
          logger.error('mission block bump failed:', e);
        }


        if (practiceStatsRes.error) {
          const errCode = (practiceStatsRes.error as { code?: string }).code;
          if (errCode === '42703') {
            await updatePracticeStatsFallback(result.is_correct, pointsDelta);
          } else {
            logger.error('Failed to update practice stats:', practiceStatsRes.error);
          }
        }
        if (topicMasteryRes && 'error' in topicMasteryRes && topicMasteryRes.error) {
          logger.error('Failed to update topic mastery:', topicMasteryRes.error);
        }
        if (streakRes.error) {
          logger.error('Failed to update streak stats:', streakRes.error);
          toast.error('Streak update failed. Please try again.');
        }

        checkDailyLimit();
        startAutoAdvance();
      }
    } catch (error) {
      logger.error('Error validating answer:', error);
      toast.error('Failed to check answer');
    } finally {
      setIsValidating(false);
    }
  };

  const handleOptionSelect = (option: string) => submitAnswer([option], null, option);

  const handleNext = () => {
    cancelAutoAdvance();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      toast.success(`Session complete! ${stats.correct}/${stats.total} correct`);
      setCurrentIndex(questions.length);
    }
  };

  const handlePrev = () => {
    cancelAutoAdvance();
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const getOptionStyle = (option: string) => {
    const answer = currentAnswer;
    if (!answer) return 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer';
    const normalizedCorrect = answer.correctOption?.toUpperCase().replace('OPTION_', '') || '';
    if (option === normalizedCorrect) return 'border-green-500 bg-green-50 dark:bg-green-950/30 ring-2 ring-green-500/30';
    if (option === answer.selectedOption && !answer.isCorrect) return 'border-red-500 bg-red-50 dark:bg-red-950/30 ring-2 ring-red-500/30';
    return 'border-border opacity-50';
  };

  const getOptionCircleStyle = (option: string) => {
    const answer = currentAnswer;
    if (!answer) return 'border-muted-foreground/40';
    const normalizedCorrect = answer.correctOption?.toUpperCase().replace('OPTION_', '') || '';
    if (option === normalizedCorrect) return 'border-green-500 bg-green-500 text-white';
    if (option === answer.selectedOption && !answer.isCorrect) return 'border-red-500 bg-red-500 text-white';
    return 'border-muted-foreground/40';
  };

  const getOptionIcon = (option: string) => {
    const answer = currentAnswer;
    if (!answer) return null;
    const normalizedCorrect = answer.correctOption?.toUpperCase().replace('OPTION_', '') || '';
    if (option === normalizedCorrect) return <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />;
    if (option === answer.selectedOption && !answer.isCorrect) return <XCircle className="w-5 h-5 text-red-600 shrink-0" />;
    return null;
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const currentQuestion = questions[currentIndex];
  const title = topicName || chapter || subject || 'Practice';

  // Expose currently visible question to floating AI Doubt Solver
  useRegisterJeenieQuestion(
    currentQuestion
      ? {
          question: currentQuestion.question,
          option_a: currentQuestion.option_a,
          option_b: currentQuestion.option_b,
          option_c: currentQuestion.option_c,
          option_d: currentQuestion.option_d,
        }
      : null,
  );

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'Easy': return 'bg-green-100 text-green-700 border-green-200';
      case 'Medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Hard': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return <LoadingScreen pageName="Practice" message="Loading practice questions..." />;
  }

  // Daily limit reached — show upgrade screen
  if (dailyLimitReached && questions.length > 0 && currentIndex < questions.length && !isCurrentAnswered) {
    return (
      <div className="mobile-app-shell-bottom-nav bg-background flex items-center justify-center p-4 overflow-hidden">
        <Card className="max-w-md w-full text-center p-8">
          <Lock className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Daily Limit Reached!</h2>
          <p className="text-muted-foreground mb-2">
            You've solved {dailyUsed} questions today. Free users get {dailyLimit}/day.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            View plans for <strong>unlimited questions</strong> — just ₹1.37/day!
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
            </Button>
            <Button className="flex-1 bg-linear-to-r from-purple-600 to-pink-600 hover:opacity-90" onClick={() => navigate('/subscription-plans')}>
              <Zap className="w-4 h-4 mr-2" /> Go Pro
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="mobile-app-shell-bottom-nav bg-background flex items-center justify-center p-4 overflow-hidden">
        <Card className="max-w-md w-full text-center p-8">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">No Questions Available</h2>
          <p className="text-muted-foreground mb-6">No practice questions found for this selection.</p>
          <Button onClick={() => navigate('/study-now')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Study
          </Button>
        </Card>
      </div>
    );
  }

  if (currentIndex >= questions.length) {
    return (
      <div className="mobile-app-shell-bottom-nav bg-background flex items-center justify-center p-4 overflow-hidden">
        <Card className="max-w-md w-full text-center p-8">
          <Trophy className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">
            {isMissionBlock ? 'Mission block complete! 🎯' : 'Practice Complete!'}
          </h2>
          {isMissionBlock && (
            <p className="text-sm text-muted-foreground mb-2">
              Planner mein auto-update ho gaya — coach ne next block ready kar diya.
            </p>
          )}
          <div className="grid grid-cols-3 gap-4 my-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.correct}</div>
              <div className="text-xs text-muted-foreground">Correct</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.wrong}</div>
              <div className="text-xs text-muted-foreground">Wrong</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{accuracy}%</div>
              <div className="text-xs text-muted-foreground">Accuracy</div>
            </div>
          </div>
          <div className="flex gap-3">
            {isMissionBlock ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => {
                  setCurrentIndex(0);
                  setStats({ correct: 0, wrong: 0, total: 0 });
                  setAnsweredQuestions(new Map());
                  setDifficultyScore(15);
                  setConsecutiveCorrect(0);
                  fetchQuestions();
                }}>
                  <RotateCcw className="w-4 h-4 mr-2" /> More Q
                </Button>
                <Button className="flex-1" onClick={() => navigate('/ai-planner')}>
                  <Trophy className="w-4 h-4 mr-2" /> Back to Planner
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/study-now')}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button className="flex-1" onClick={() => {
                  setCurrentIndex(0);
                  setStats({ correct: 0, wrong: 0, total: 0 });
                  setAnsweredQuestions(new Map());
                  setDifficultyScore(15);
                  setConsecutiveCorrect(0);
                  fetchQuestions();
                }}>
                  <RotateCcw className="w-4 h-4 mr-2" /> Retry
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>
    );
  }


  return (
    <div className="mobile-app-shell-bottom-nav bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="shrink-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/study-now')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="text-center">
            <h1 className="text-sm font-bold text-primary truncate max-w-[200px]">{title}</h1>
            <p className="text-xs text-muted-foreground">Q {currentIndex + 1}/{questions.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Target className="w-3 h-3 mr-1" />{accuracy}%
            </Badge>
          </div>

        </div>
      </div>

      {/* Daily limit warning banner */}
      {dailyRemaining <= 3 && dailyRemaining > 0 && !dailyLimitReached && (
        <div className="shrink-0 bg-amber-500/90 text-white text-center py-1.5 text-xs font-medium">
          ⚠️ Only {dailyRemaining} questions left today! <button onClick={() => navigate('/subscription-plans')} className="underline font-bold">View Plans →</button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="shrink-0 container mx-auto max-w-3xl px-4 pt-2">
        <div className="flex items-center justify-center gap-6 text-sm">
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle className="w-4 h-4" /> {stats.correct}
          </span>
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <XCircle className="w-4 h-4" /> {stats.wrong}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            Total: {stats.total}
          </span>
        </div>
      </div>

      {/* Question Area — flex-1 with internal scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto container mx-auto max-w-3xl px-4 py-3">
        {/* mission strip removed */}

        {studyNotesEnabled && chapterId && (
          <StudyNotesIntro chapterId={chapterId} topicId={topicId || undefined} />
        )}
        <Card className="mb-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base sm:text-lg">Question {currentIndex + 1}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <ReportButton onClick={() => setReportingQuestionId(currentQuestion.id)} />
                {currentQuestion.is_pyq && (currentQuestion.pyq_exam || currentQuestion.pyq_year) && (
                  <Badge
                    variant="outline"
                    className="text-[10px] sm:text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                    title="Previous Year Question"
                  >
                    {[
                      currentQuestion.pyq_exam ? String(currentQuestion.pyq_exam).replace(/_/g, ' ') : '',
                      currentQuestion.pyq_year ? String(currentQuestion.pyq_year) : '',
                    ].filter(Boolean).join(' ')}
                    {currentQuestion.pyq_session ? ` (${currentQuestion.pyq_session})` : ''}
                  </Badge>
                )}
                {currentQuestion.difficulty && (
                  <Badge variant="outline" className={`text-xs capitalize ${getDifficultyColor(currentQuestion.difficulty)}`}>
                    {currentQuestion.difficulty}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm sm:text-base leading-relaxed mb-4">
              <MathDisplay text={currentQuestion.question_text || currentQuestion.question} />
            </div>

            {currentQuestion.question_image_url && (
              <div className="mb-4 flex justify-center">
                <img
                  src={currentQuestion.question_image_url}
                  alt="Question diagram"
                  loading="lazy"
                  className="max-h-72 sm:max-h-96 rounded-lg border border-border object-contain bg-background"
                />
              </div>
            )}

            {(() => {
              const qType = currentQuestion.question_type || 'single_correct';

              // Numerical question: number input
              if (qType === 'numerical_int' || qType === 'numerical_decimal') {
                const onSubmit = () => {
                  const v = parseFloat(numericalInput);
                  if (!Number.isFinite(v)) {
                    toast.error('Please enter a valid number');
                    return;
                  }
                  submitAnswer([], v, numericalInput);
                };
                return (
                  <div className="space-y-3">
                    <label className="text-xs text-muted-foreground font-medium">
                      Enter your numerical answer
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={qType === 'numerical_int' ? '1' : 'any'}
                      value={numericalInput}
                      onChange={(e) => setNumericalInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
                      disabled={isCurrentAnswered || dailyLimitReached}
                      placeholder="e.g. 42"
                      className="w-full p-3 rounded-xl border-2 border-border bg-background text-base focus:border-primary focus:outline-none disabled:opacity-60"
                    />
                    {!isCurrentAnswered && (
                      <Button
                        onClick={onSubmit}
                        disabled={!numericalInput.trim() || isValidating || dailyLimitReached}
                        className="w-full"
                      >
                        Submit Answer
                      </Button>
                    )}
                  </div>
                );
              }

              // Multi-correct: checkboxes + submit
              if (qType === 'multi_correct') {
                const toggle = (opt: string) => {
                  if (isCurrentAnswered) return;
                  setMultiSelected(prev => {
                    const next = new Set(prev);
                    if (next.has(opt)) next.delete(opt); else next.add(opt);
                    return next;
                  });
                };
                const onSubmit = () => {
                  if (multiSelected.size === 0) {
                    toast.error('Select at least one option');
                    return;
                  }
                  const letters = Array.from(multiSelected).sort();
                  submitAnswer(letters, null, letters.join(','));
                };
                return (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">Select all correct options</p>
                    <div className="space-y-2">
                      {OPTIONS.map(option => {
                        const optionText = String(currentQuestion[`option_${option.toLowerCase()}` as keyof Question] || '').trimStart();
                        if (!optionText) return null;
                        const isPicked = multiSelected.has(option);
                        const correctSet = new Set((currentAnswer?.correctOption || '').split(',').map(s => s.trim()).filter(Boolean));
                        const isCorrectOpt = correctSet.has(option);
                        const showResult = isCurrentAnswered;
                        return (
                          <button
                            key={option}
                            onClick={() => toggle(option)}
                            disabled={isCurrentAnswered || dailyLimitReached}
                            className={`w-full p-3 text-left rounded-xl border-2 transition-all duration-300 ${
                              showResult
                                ? isCorrectOpt
                                  ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                                  : isPicked
                                    ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                                    : 'border-border opacity-60'
                                : isPicked
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded border-2 flex items-center justify-center text-sm font-bold shrink-0 ${isPicked || (showResult && isCorrectOpt) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                                {isPicked || (showResult && isCorrectOpt) ? '✓' : option}
                              </div>
                              <span className="text-sm flex-1">
                                <MathDisplay text={optionText} />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {!isCurrentAnswered && (
                      <Button
                        onClick={onSubmit}
                        disabled={multiSelected.size === 0 || isValidating || dailyLimitReached}
                        className="w-full mt-3"
                      >
                        Submit ({multiSelected.size} selected)
                      </Button>
                    )}
                  </>
                );
              }

              // Default: single-correct radio buttons
              return (
                <div className="space-y-2">
                  {OPTIONS.map(option => {
                    const optionText = String(currentQuestion[`option_${option.toLowerCase()}` as keyof Question] || '').trimStart();
                    if (!optionText) return null;
                    return (
                      <button
                        key={option}
                        onClick={() => handleOptionSelect(option)}
                        disabled={isCurrentAnswered || dailyLimitReached}
                        className={`w-full p-3 text-left rounded-xl border-2 transition-all duration-300 ${getOptionStyle(option)}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 transition-all ${getOptionCircleStyle(option)}`}>
                            {option}
                          </div>
                          <span className="text-sm flex-1">
                            <MathDisplay text={optionText} />
                          </span>
                          {getOptionIcon(option)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Per-question explanation */}
            {isCurrentAnswered && currentAnswer && (
              <div className={`mt-4 p-3 rounded-lg border ${
                currentAnswer.isCorrect
                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {currentAnswer.isCorrect ? (
                    <span className="font-bold text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Correct!
                    </span>
                  ) : (
                    <span className="font-bold text-sm text-red-700 dark:text-red-400 flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Incorrect
                    </span>
                  )}
                </div>
                <div className="text-xs text-foreground/80 leading-relaxed">
                  <MathDisplay text={currentAnswer.explanation} />
                </div>
                <div className="mt-2 text-xs text-foreground/80">
                  <span className="font-medium">Correct answer:</span>{' '}
                  {(() => {
                    const co = currentAnswer.correctOption || '';
                    const letters = co.split(',').map(s => s.trim()).filter(s => /^[A-D]$/i.test(s));
                    if (letters.length > 0) {
                      return (
                        <span>
                          {letters.join(', ')}
                          {letters.map(l => {
                            const txt = String(currentQuestion[`option_${l.toLowerCase()}` as keyof Question] || '');
                            return txt ? (
                              <span key={l} className="ml-1">
                                — <MathDisplay text={txt} />
                              </span>
                            ) : null;
                          })}
                        </span>
                      );
                    }
                    return <span>{co}</span>;
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fixed Bottom Nav Bar */}
      <div className="shrink-0 z-30 border-t border-border bg-background/95 backdrop-blur-md px-4 py-3">
        <div className="container mx-auto max-w-3xl flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Prev
          </Button>

          <span className="text-xs text-muted-foreground">
            {isCurrentAnswered ? (currentAnswer?.isCorrect ? '✅' : '❌') : `Q${currentIndex + 1}`}
          </span>

          <Button
            size="sm"
            onClick={() => { cancelAutoAdvance(); handleNext(); }}
            disabled={!isCurrentAnswered && currentIndex < questions.length - 1}
          >
            {currentIndex < questions.length - 1 ? (
              <>Next <ArrowRight className="w-4 h-4 ml-1" /></>
            ) : (
              <>Results <Trophy className="w-4 h-4 ml-1" /></>
            )}
          </Button>
        </div>
      </div>

      {/* Report Dialog */}
      {reportingQuestionId && (
        <QuestionReportDialog
          questionId={reportingQuestionId}
          questionText={currentQuestion?.question}
          onClose={() => setReportingQuestionId(null)}
          onReported={(qid) => {
            // Remove the reported question from the local queue and advance
            setQuestions(prev => {
              const idx = prev.findIndex(q => q.id === qid);
              if (idx === -1) return prev;
              const next = prev.filter(q => q.id !== qid);
              // Keep currentIndex pointing to the next question naturally
              setCurrentIndex(ci => Math.min(ci, Math.max(0, next.length - 1)));
              return next;
            });
          }}
        />
      )}
    </div>
  );
};

export default PracticePage;

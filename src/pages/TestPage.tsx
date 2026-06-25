import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/contexts/AuthContext';
import { toast } from "sonner";
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import Header from '@/components/Header';
import LoadingScreen from '@/components/ui/LoadingScreen';
import safeLocalStorage from '@/utils/safeStorage';
import {
  BookOpen, Trophy, Play, Clock, Target, FileText, ArrowLeft, CheckCircle2,
  Sparkles, Crown, Award, Users, Calendar
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PricingModal from '@/components/PricingModal';
import { logger } from '@/utils/logger';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import { parseGrade, isFoundationGrade, extractGradeFromExamType } from '@/utils/gradeParser';
import { FilterPills } from '@/components/ui/FilterPills';
import { FREE_LIMITS } from '@/config/subscriptionPlans';
import { testsAPI } from '@/services/api';
import { UserLimitsService } from '@/services/userLimitsService';
import { 
  getBatchForStudent, 
  getBatchSubjectsFromDB, 
  getFilteredSubjects, 
  getAllowedSubjects, 
  logBatchConfig 
} from '@/utils/batchConfig';
import {
  getChaptersForBatch,
  getPracticeQuestions,
  getTestSeriesQuestions,
} from '@/utils/batchQueryBuilder';
import { getExamPattern, EXAM_PATTERNS } from '@/config/examPatterns';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { normalizeTargetExam } from '@/config/goalConfig';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import { getSubjectAliases } from '@/lib/subjectNormalization';

const LOCAL_TEST_HISTORY_KEY = 'local_test_history_v1';
type TestHistorySession = any;
type ChapterOption = { id: string; subject: string; chapter: string };

const TestPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const testHistoryEnabled = useFeatureFlag('test_history');
  const [loading, setLoading] = useState(false);
  const [testMode, setTestMode] = useState<string>('');
  const [pyqExam, setPyqExam] = useState<string>('');
  const [pyqYear, setPyqYear] = useState<string>('');
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [usageChecked, setUsageChecked] = useState<boolean>(false);
  const [monthlyTestsUsed, setMonthlyTestsUsed] = useState<number>(0);
  const MONTHLY_LIMIT_FREE = FREE_LIMITS.testsPerMonth;
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [chapters, setChapters] = useState<Record<string, ChapterOption[]>>({});
  const [availableChapters, setAvailableChapters] = useState<ChapterOption[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<ChapterOption[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [testHistory, setTestHistory] = useState<TestHistorySession[]>([]);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [hasProAccess, setHasProAccess] = useState<boolean>(false);
  const [loadingChapters, setLoadingChapters] = useState<boolean>(false);
  const profile = studentProfile;
  const testGridClass = hasProAccess
    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 py-2 sm:py-4'
    : 'grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 py-2 sm:py-4';
  const currentYear = new Date().getFullYear();
  const pyqYears = Array.from({ length: 10 }, (_, i) => (currentYear - i).toString());

  const testHistorySection = () => (
    <div className="mb-6 p-4 rounded-2xl border border-border bg-card/60 shadow-xs">
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full flex items-center justify-between gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
      >
        <span className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Test History ({testHistory.length})
        </span>
        <span className="text-xs text-muted-foreground">{showHistory ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {historyLoadError && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {historyLoadError}
        </p>
      )}

      {showHistory && (
        <div className="mt-3">
          {testHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No tests yet. Start one now and your history will appear here.
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {testHistory.map((session) => {
                const isGroup = !!session.group_test_id;
                const isLocalOnly = session.id.startsWith('local-');
                const completedDate = session.completed_at ? new Date(session.completed_at) : session.started_at ? new Date(session.started_at) : new Date(session.created_at);
                const statusLabel = session.status || (session.completed_at ? 'completed' : 'in_progress');
                return (
                  <div
                    key={session.id}
                    className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isGroup ? 'bg-emerald-100 text-emerald-600' : 'bg-primary/10 text-primary'}`}>
                        {isGroup ? <Users className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {session.title || 'Mock Test'}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{completedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">{statusLabel}</Badge>
                          {isGroup && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700">Group</Badge>}
                          {isLocalOnly && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-700">Local</Badge>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs shrink-0 w-full lg:w-auto justify-between lg:justify-start">
                      <div className="text-center">
                        <div className="font-bold text-foreground">{session.score ?? 0}</div>
                        <div className="text-muted-foreground">Score</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-foreground">{Math.round(session.accuracy ?? 0)}%</div>
                        <div className="text-muted-foreground">Accuracy</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-foreground">{session.correct_answers ?? 0}/{session.total_questions ?? 0}</div>
                        <div className="text-muted-foreground">Correct</div>
                      </div>
                      {session.time_taken && (
                        <div className="text-center">
                          <div className="font-bold text-foreground">{Math.round(session.time_taken / 60)}m</div>
                          <div className="text-muted-foreground">Time</div>
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isLocalOnly}
                        className="text-xs h-7 px-2"
                        onClick={() => navigate(`/test-results/${session.id}`)}
                      >
                        {isLocalOnly ? 'Sync Pending' : 'View'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const getLocalHistory = (): TestHistorySession[] => {
    try {
        const raw = safeLocalStorage.getItem(LOCAL_TEST_HISTORY_KEY);
        if (!raw) return [];

        const parsed = JSON.parse(raw) as TestHistorySession[];
        if (!Array.isArray(parsed)) return [];

        return parsed
          .filter((item) => item && typeof item.id === 'string')
          .sort((a, b) => {
            const aDate = new Date(a.completed_at || a.started_at || a.created_at || 0).getTime();
            const bDate = new Date(b.completed_at || b.started_at || b.created_at || 0).getTime();
            return bDate - aDate;
          });
      } catch (err) {
        logger.warn('Invalid local test history format, ignoring.', err);
        return [];
      }
    };

    useEffect(() => {
      let cancelled = false;

      const loadStudentProfile = async () => {
        if (!user?.id) {
          if (!cancelled) setStudentProfile(null);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          logger.warn('Failed to load test profile', error);
          setStudentProfile(null);
          return;
        }

        setStudentProfile(data || null);
      };

      void loadStudentProfile();

      return () => {
        cancelled = true;
      };
    }, [user?.id]);

    useEffect(() => {
      let cancelled = false;

      const initAccessState = async () => {
        const profileId = profile?.id;

        if (!profileId) {
          if (!cancelled) {
            setIsPremium(false);
            setHasProAccess(false);
            setMonthlyTestsUsed(0);
            setUsageChecked(true);
          }
          return;
        }

        try {
          const [isPro, monthlyUsage] = await Promise.all([
            UserLimitsService.isPro(profileId),
            UserLimitsService.getMonthlyTestUsage(profileId),
          ]);

          if (cancelled) return;

          setIsPremium(isPro);
          setHasProAccess(isPro);
          setMonthlyTestsUsed(monthlyUsage);
        } catch (error) {
          logger.warn('Failed to initialize test access state', error);
          if (cancelled) return;
          setIsPremium(false);
          setHasProAccess(false);
          setMonthlyTestsUsed(0);
        } finally {
          if (!cancelled) setUsageChecked(true);
        }
      };

      void initAccessState();

      return () => {
        cancelled = true;
      };
    }, [profile?.id]);

    useEffect(() => {
      let cancelled = false;

      const loadSubjects = async () => {
        const targetExam = normalizeTargetExam(profile?.target_exam || 'BOARDS');
        const fallbackSubjects = getAllowedSubjects(targetExam);

        if (!profile?.id) {
          if (!cancelled) setAvailableSubjects(fallbackSubjects);
          return;
        }

        try {
          const grade = parseGrade(profile?.grade || 12);
          const batch = await getBatchForStudent(profile.id, grade, targetExam);

          let nextSubjects: string[] = [];
          if (batch?.id) {
            const batchSubjects = batch.subjects?.length
              ? batch.subjects
              : await getBatchSubjectsFromDB(batch.id);
            nextSubjects = getFilteredSubjects(targetExam, batchSubjects);
          }

          if (nextSubjects.length === 0) {
            nextSubjects = fallbackSubjects;
          }

          if (cancelled) return;

          setAvailableSubjects(nextSubjects);

          if (selectedSubject && !nextSubjects.includes(selectedSubject)) {
            setSelectedSubject('');
            setSelectedChapters([]);
            setAvailableChapters([]);
          }
        } catch (error) {
          logger.warn('Falling back to allowed subjects for chapter test', error);
          if (!cancelled) setAvailableSubjects(fallbackSubjects);
        }
      };

      void loadSubjects();

      return () => {
        cancelled = true;
      };
    }, [profile?.id, profile?.grade, profile?.target_exam, selectedSubject]);

    useEffect(() => {
      let cancelled = false;

      const loadChapterOptions = async () => {
        if (!profile?.id) {
          if (!cancelled) {
            setChapters({});
            setAvailableChapters([]);
          }
          return;
        }

        const targetExam = profile?.target_exam || 'JEE';
        const grade = parseGrade(profile?.grade || 12);
        const subjectsToLoad = testMode === 'chapter'
          ? (selectedSubject ? [selectedSubject] : availableSubjects)
          : [];

        if (subjectsToLoad.length === 0) {
          if (!cancelled) {
            setChapters({});
            setAvailableChapters([]);
          }
          return;
        }

        setLoadingChapters(true);

        try {
          const batch = await getBatchForStudent(profile.id, grade, targetExam);
          const nextChapters: Record<string, ChapterOption[]> = {};

          await Promise.all(subjectsToLoad.map(async (subject) => {
            const chapterRows = await getChaptersForBatch({
              batchId: batch?.id || '',
              examType: targetExam,
              subject,
              grade,
            });

            nextChapters[subject] = (chapterRows || [])
              .map((row: any) => ({
                id: row.id,
                subject: row.subject || subject,
                chapter: row.chapter_name || row.name || row.chapter || 'Chapter',
              }))
              .filter((row: ChapterOption) => row.id && row.chapter);
          }));

          if (cancelled) return;
          setChapters(nextChapters);
          setAvailableChapters(selectedSubject ? nextChapters[selectedSubject] || [] : []);
        } catch (error) {
          logger.error('Failed to load chapter setup data', error);
          if (!cancelled) {
            setChapters({});
            setAvailableChapters([]);
          }
        } finally {
          if (!cancelled) setLoadingChapters(false);
        }
      };

      void loadChapterOptions();

      return () => {
        cancelled = true;
      };
    }, [profile?.id, profile?.grade, profile?.target_exam, selectedSubject, testMode, availableSubjects]);

    const loadHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setHistoryLoadError(null);

      const { data, error } = await supabase
        .from('test_sessions')
        .select('id, title, status, score, accuracy, correct_answers, total_questions, time_taken, group_test_id, completed_at, started_at, created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(new Date().getFullYear(), 0, 1).toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const localHistory = getLocalHistory();
      const merged = [...(data || []), ...localHistory].filter(
        (session, index, arr) => arr.findIndex((s) => s.id === session.id) === index
      );
      merged.sort((a, b) => {
        const aDate = new Date(a.completed_at || a.started_at || a.created_at || 0).getTime();
        const bDate = new Date(b.completed_at || b.started_at || b.created_at || 0).getTime();
        return bDate - aDate;
      });
      setTestHistory(merged);
    } catch (error) {
      logger.error('Error loading test history:', error);
      setHistoryLoadError('Cloud history unavailable right now. Showing local history only.');
      setTestHistory(getLocalHistory());
    }
  }, []);

      useEffect(() => {
        loadHistory();
      }, [loadHistory]);

  const reserveSessionOrProceedLocally = async (
    userId: string,
    subject: string,
    totalQuestions: number,
    title: string,
    questionIds: string[],
    groupTestId?: string
  ): Promise<string | null> => {
    const reservation = await testsAPI.reserveTestSessionLegacy(
      userId,
      subject,
      totalQuestions,
      title,
      questionIds,
      groupTestId,
    );

    if (reservation.error || !reservation.data?.id) {
      logger.warn('Unable to reserve test session, continuing in local mode.', {
        code: reservation.error?.code,
        message: reservation.error?.message,
      });
      toast.warning('Cloud sync issue detected. Test started in local mode; history sync may be delayed.');
      return null;
    }

    return reservation.data.id;
  };

  const getAttemptedQuestionIds = async (userId: string): Promise<Set<string>> => {
    const settledResults = await Promise.allSettled([
      fetchAllPaginated(() => supabase.from('question_attempts').select('question_id').eq('user_id', userId)),
    ]);

    const attemptedIds = new Set<string>();

    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        (result.value || []).forEach((row: any) => {
          if (row?.question_id) attemptedIds.add(row.question_id);
        });
      } else {
        logger.warn('Failed to load attempted questions', { index, error: result.reason });
      }
    });

    return attemptedIds;
  };

  const handleSubjectToggle = (subject: string) => {
    setSelectedSubject(subject);
    const newChapters = chapters[subject] || [];
    setAvailableChapters(newChapters);
    setSelectedChapters(prevChapters =>
      prevChapters.filter(ch => newChapters.some(nc => nc.id === ch.id))
    );
  };

  const handleChapterToggle = (chapterOption: ChapterOption) => {
    setSelectedChapters(prev => {
      const exists = prev.some(ch => ch.id === chapterOption.id);
      return exists ? prev.filter(ch => ch.id !== chapterOption.id)
        : [...prev, chapterOption];
    });
  };

  const startTest = async (mode = testMode) => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please login to take tests");
      navigate('/login');
      return;
    }

    if (!isPremium && !usageChecked) {
      toast.info('Checking your free test quota. Please wait a moment.');
      return;
    }

    const testAccess = await UserLimitsService.canStartTest(user.id);

    const getExamAliases = (exam?: string | null, grade?: number | null): string[] => {
      if (!exam) return [];
      const value = exam.trim();
      const lower = value.toLowerCase();

      if (lower.includes('jee')) {
        return ['JEE', 'JEE Mains', 'JEE Advanced'];
      }
      if (lower.includes('neet')) {
        return ['NEET'];
      }
      if (lower.includes('mh-cet') || lower.includes('mh_cet') || lower.includes('mht-cet')) {
        return ['MH-CET', 'MH_CET', 'MHT-CET'];
      }
      if ((grade && grade <= 10) || lower.includes('foundation')) {
        return grade ? ['Foundation', `Foundation-${grade}`] : ['Foundation'];
      }
      if (lower.includes('scholarship')) {
        return ['Scholarship'];
      }

      return [value];
    };

    // Early exit for free users who exceeded limit
    if (!testAccess.canStart) {
      setShowUpgradeModal(true);
      toast.error(`You've used all ${MONTHLY_LIMIT_FREE} free tests this month!`);
      return;
    }

    // For PYQ mock test
    if (mode === "pyq") {
      if (!pyqExam || !pyqYear) {
        toast.error("Please select exam and year");
        return;
      }
      setLoading(true);
      toast.loading("Preparing your PYQ mock test...");

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Please login to take tests");
          navigate('/login');
          return;
        }

        const pattern = getExamPattern(pyqExam);

        const attemptedIds = await getAttemptedQuestionIds(user.id);

        // Fetch per-subject to match actual exam pattern
        const allSelected: any[] = [];
        for (const subject of pattern.subjects) {
          const config = pattern.subjectConfig[subject];
          const examAliases = getExamAliases(pyqExam, parseGrade(profile?.grade || 12));

          const subjectQs = await fetchAllPaginated(() =>
            supabase
              .from('questions_public')
              .select('*')
              .in('exam', examAliases)
              .eq('year', parseInt(pyqYear))
              .eq('subject', subject)
              .or('is_active.is.null,is_active.eq.true')
          );
          logger.info('PYQ test subject query', { 
            subject, 
            pyqExam,
            examAliases,
            year: pyqYear,
            questionsFound: subjectQs?.length || 0
          });
          
          if (subjectQs && subjectQs.length > 0) {
            const filtered = subjectQs.filter(q => !attemptedIds.has(q.id));
            const shuffled = filtered.sort(() => Math.random() - 0.5);
            allSelected.push(...shuffled.slice(0, config.questionsPerSubject));
          }
        }

        if (allSelected.length === 0) {
          toast.dismiss();
          toast.error("No PYQ questions available for this exam and year.");
          setLoading(false);
          return;
        }

        if (allSelected.length < pattern.totalQuestions) {
          toast.dismiss();
          toast.info(`Only ${allSelected.length} PYQ questions available (${pattern.totalQuestions} needed for full paper).`);
        }

        const reservedSessionId = await reserveSessionOrProceedLocally(
          user.id,
          pyqExam,
          allSelected.length,
          `${pyqExam} ${pyqYear} - PYQ Mock Test`,
          allSelected.map(question => question.id),
        );

        const testSession = {
          id: Date.now().toString(),
          title: `${pyqExam} ${pyqYear} - PYQ Mock Test`,
          questions: allSelected,
          duration: pattern.duration,
          startTime: new Date().toISOString(),
          examPattern: pyqExam,
          sessionId: reservedSessionId || undefined,
        };

        safeLocalStorage.setItem('currentTest', JSON.stringify(testSession));
        const nextMonthlyUsage = UserLimitsService.recordMonthlyTestUsage(user.id);
        setMonthlyTestsUsed(nextMonthlyUsage);
        toast.dismiss();
        toast.success(`PYQ Mock Test started with ${allSelected.length} questions!`);
        navigate('/test-attempt', { state: { currentTest: testSession } });
      } catch (error) {
        logger.error('Error starting PYQ test:', error);
        toast.dismiss();
        toast.error("Failed to start PYQ test");
        setLoading(false);
      }
      return;
    }

    // For full mock test
    if (mode === "full") {
      setLoading(true);
      toast.loading("Preparing your full mock test...");

      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          toast.error("Please login to take tests");
          navigate('/login');
          return;
        }

        const targetExam = profile?.target_exam || 'JEE';
        const userGrade = parseGrade(profile?.grade || 12);
        
        // Determine which exam pattern to use
        let examPatternName = targetExam;
        if (targetExam === 'JEE') examPatternName = 'JEE Mains';
        const pattern = getExamPattern(examPatternName);
        
        const testBatch = await getBatchForStudent(user.id, userGrade, targetExam);
        logger.info('Full mock test setup', { targetExam, userGrade, batchId: testBatch?.id, pattern: pattern.name });
        
        const attemptedIds = await getAttemptedQuestionIds(user.id);

        const rawQuestions = await getTestSeriesQuestions({
          batchId: testBatch?.id || '',
          examType: examPatternName,
          grade: userGrade,
          subjects: pattern.subjects,
          testDuration: pattern.duration,
          difficulty: 'Mixed',
          excludeIds: Array.from(attemptedIds),
        });

        logger.info('Full mock test questions fetched', {
          examPatternName,
          batchId: testBatch?.id || null,
          questionCount: rawQuestions.length,
        });

        const allSelected = rawQuestions
          .filter((question) => !attemptedIds.has(question.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, pattern.totalQuestions);
        
        if (allSelected.length === 0) {
          toast.dismiss();
          toast.error("No new questions available! All questions already attempted.");
          setLoading(false);
          return;
        }

        if (allSelected.length < pattern.totalQuestions) {
          toast.dismiss();
          toast.info(`Only ${allSelected.length} new questions available (${pattern.totalQuestions} needed for full paper). Starting with available questions.`);
        }

        const reservedSessionId = await reserveSessionOrProceedLocally(
          user.id,
          targetExam,
          allSelected.length,
          `Full Syllabus Mock Test - ${pattern.name} Pattern`,
          allSelected.map(question => question.id),
        );

        const testSession = {
          id: Date.now().toString(),
          title: `Full Syllabus Mock Test - ${pattern.name} Pattern`,
          questions: allSelected,
          duration: pattern.duration,
          startTime: new Date().toISOString(),
          examPattern: pattern.name,
          sessionId: reservedSessionId || undefined,
        };

        safeLocalStorage.setItem('currentTest', JSON.stringify(testSession));
        const nextMonthlyUsage = UserLimitsService.recordMonthlyTestUsage(user.id);
        setMonthlyTestsUsed(nextMonthlyUsage);
            
        toast.dismiss();
        toast.success(`Full mock test started with ${allSelected.length} questions!`);
        navigate('/test-attempt', { state: { currentTest: testSession } });
      } catch (error) {
        logger.error('Error starting test:', error);
        toast.dismiss();
        toast.error("Failed to start test");
        setLoading(false);
      }
      return;
    }

    // For chapter/subject tests
    if (selectedChapters.length === 0 && !selectedSubject) {
      toast.error("Please select at least one chapter or subject");
      return;
    }

    setLoading(true);
    toast.loading("Preparing your test...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("Please login to take tests");
        navigate('/login');
        return;
      }
      
      const attemptedIds = await getAttemptedQuestionIds(user.id);

      const targetExam = profile?.target_exam || 'JEE';
      const userGrade = parseGrade(profile?.grade || 12);
      const examAliases = getExamAliases(targetExam, userGrade);
      const chapterTestBatch = await getBatchForStudent(user.id, userGrade, targetExam);
      logger.info('Chapter/Subject test', { targetExam, examAliases, userGrade, batchId: chapterTestBatch?.id });

      let questions: any[] = [];

      if (mode === "subject" && selectedSubject) {
        questions = await getTestSeriesQuestions({
          batchId: chapterTestBatch?.id || '',
          examType: targetExam,
          grade: userGrade,
          subjects: [selectedSubject],
          testDuration: 60,
          difficulty: 'Mixed',
        });
      } else if (mode === "chapter" && selectedChapters.length > 0) {
        const perChapterLimit = 25;
        const chapterBatches = await Promise.all(selectedChapters.map(async (chapter) => {
          return getPracticeQuestions({
            batchId: chapterTestBatch?.id || '',
            examType: targetExam,
            grade: userGrade,
            subject: chapter.subject,
            chapter: chapter.chapter,
            chapterIds: [chapter.id],
            limit: perChapterLimit,
          });
        }));

        questions = chapterBatches.flat();
      }

      if (!questions || questions.length === 0) {
        const fallbackQuestions = mode === "subject" && selectedSubject
          ? await getPracticeQuestions({
              batchId: chapterTestBatch?.id || '',
              examType: targetExam,
              grade: userGrade,
              subject: selectedSubject,
              limit: 25,
            })
          : [];

        if (fallbackQuestions.length > 0) {
          questions = fallbackQuestions;
        }
      }
      
      logger.info('Chapter/Subject test questions fetched', { 
        totalCount: questions?.length || 0, 
        mode, 
        selectedSubject, 
        selectedChaptersCount: selectedChapters?.length || 0,
        examAliases,
        batchId: chapterTestBatch?.id || null
      });
      
      // Filter attempted questions client-side
      const attemptedSet = new Set(attemptedIds);
      const filteredQuestions = questions.filter(q => !attemptedSet.has(q.id));
      
      logger.info('After filtering attempted questions', { 
        totalCount: filteredQuestions?.length || 0 
      });
      
      if (!filteredQuestions || filteredQuestions.length === 0) {
        toast.dismiss();
        toast.error("No new questions available! All questions already attempted.");
        setLoading(false);
        return;
      }

      // Determine exam pattern for marking scheme and question count
      let examPatternName = targetExam;
      if (targetExam === 'JEE') examPatternName = 'JEE Mains';
      const pattern = getExamPattern(examPatternName);

      // For chapter/subject tests, use per-subject question count from pattern
      // If single subject selected, use that subject's count; otherwise cap at 25
      let questionLimit = 25;
      let testDuration = 60;
      
      if (mode === "subject" && selectedSubject) {
        const subjectConfig = pattern.subjectConfig[selectedSubject] || pattern.subjectConfig[getSubjectAliases(selectedSubject)[0]];
        if (subjectConfig) {
          questionLimit = subjectConfig.questionsPerSubject;
          // Scale duration proportionally
          testDuration = Math.round((questionLimit / pattern.totalQuestions) * pattern.duration);
        }
      }

      if (filteredQuestions.length < questionLimit) {
        toast.dismiss();
        toast.info(`Only ${filteredQuestions.length} new questions available. Starting test with ${filteredQuestions.length} questions.`);
      }

      const shuffled = filteredQuestions.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(questionLimit, filteredQuestions.length));

      const reservedSessionId = await reserveSessionOrProceedLocally(
        user.id,
        formatSubjectDisplay(mode === "chapter" ? 'General' : selectedSubject, mode === "chapter" ? selectedChapters.map(ch => ch.chapter).join(', ') : undefined),
        selected.length,
        mode === "chapter"
          ? `${selectedChapters.map(ch => ch.chapter).join(', ')} - Chapter Test`
          : `${selectedSubject} - Subject Test`,
        selected.map(question => question.id),
      );

      const testSession = {
        id: Date.now().toString(),
        title: mode === "chapter" 
          ? `${selectedChapters.map(ch => ch.chapter).join(', ')} - Chapter Test`
          : `${selectedSubject} - Subject Test`,
        questions: selected,
        duration: testDuration,
        startTime: new Date().toISOString(),
        examPattern: pattern.name,
        sessionId: reservedSessionId || undefined,
      };

      safeLocalStorage.setItem('currentTest', JSON.stringify(testSession));

      // Increment monthly usage count immediately for UI feedback
      const nextMonthlyUsage = UserLimitsService.recordMonthlyTestUsage(user.id);
      setMonthlyTestsUsed(nextMonthlyUsage);
          
      toast.dismiss();
      toast.success(`Test started with ${selected.length} fresh questions!`);
      navigate('/test-attempt', { state: { currentTest: testSession } });
    } catch (error) {
      logger.error('Error starting test:', error);
      toast.dismiss();
      toast.error("Failed to start test");
      setLoading(false);
    }
  };

  if (showUpgradeModal) {
    return (
      <>
        <div className="mobile-app-shell bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
          <Header />
        </div>
        <PricingModal 
          isOpen={showUpgradeModal}
          onClose={() => {
            setShowUpgradeModal(false);
            navigate('/subscription-plans');
          }}
          limitType="test_limit"
        />
      </>
    );
  }
  
  const freeTestQuotaPending = !hasProAccess && !usageChecked;
  const freeTestQuotaReached = !hasProAccess && usageChecked && monthlyTestsUsed >= MONTHLY_LIMIT_FREE;
  const monthlyTestsDisplay = hasProAccess ? '∞' : Math.min(monthlyTestsUsed, MONTHLY_LIMIT_FREE);

  if (loading) {
    return <LoadingScreen pageName="Tests" />;
  }

  if (testMode === "pyq") {
    return (
      <div className="mobile-app-shell bg-linear-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 min-h-0 overflow-y-auto py-4 sm:py-6">
          <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-3xl">
            <Button 
              variant="outline"
              className="mb-4 sm:mb-6 border-2 border-amber-500 text-sm"
              onClick={() => {
                setTestMode("");
                setPyqExam("");
                setPyqYear("");
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Test Selection
            </Button>

            <Card className="border-2 border-amber-200 dark:border-amber-700/60 shadow-lg bg-white dark:bg-slate-900 overflow-hidden">
              <CardHeader className="bg-linear-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20 border-b border-amber-200 dark:border-amber-700/50 p-4 sm:p-6">
                <CardTitle className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
                    <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <span className="text-base sm:text-3xl">PYQ Mock Test Setup</span>
                </CardTitle>
                <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs sm:text-base">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500" />
                  Select exam and year to practice with actual past paper questions
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-6">
                <div>
                  <h3 className="text-sm sm:text-lg font-bold mb-3 text-foreground flex items-center gap-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-linear-to-br from-amber-500 to-yellow-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                      1
                    </div>
                    Select Exam
                  </h3>
                  <FilterPills
                    options={["JEE Mains", "JEE Advanced", "NEET", "MH-CET"]}
                    selected={pyqExam}
                    onSelect={setPyqExam}
                  />
                </div>

                <div>
                  <h3 className="text-sm sm:text-lg font-bold mb-3 text-foreground flex items-center gap-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-linear-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                      2
                    </div>
                    Select Year
                  </h3>
                  <Select value={pyqYear} onValueChange={setPyqYear}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {pyqYears.map((year) => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-500/90 hover:to-yellow-600/90 text-white font-semibold py-3 rounded-xl shadow-md text-sm sm:text-base"
                  disabled={!pyqExam || !pyqYear || loading || freeTestQuotaPending || freeTestQuotaReached}
                  onClick={() => startTest("pyq")}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start {pyqExam} {pyqYear} Mock Test
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!testMode) {

    return (
      <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-secondary rounded-full -translate-y-1/2 translate-x-1/3 opacity-40" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-secondary rounded-full translate-y-1/2 -translate-x-1/3 opacity-30" />
        </div>
        <Header />
        <div className="flex-1 min-h-0 overflow-y-auto relative z-10">
          <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-7xl min-h-full flex flex-col justify-center py-4 sm:py-6">

            {!hasProAccess && (
              <div className="mb-4 p-3 sm:p-4 rounded-2xl bg-secondary border border-primary/10 shadow-xs">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="bg-primary p-2 rounded-xl shrink-0">
                      <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-primary text-sm sm:text-base">
                        Mock Tests: {monthlyTestsDisplay}/{MONTHLY_LIMIT_FREE} this month
                      </p>
                      <p className="text-xs sm:text-sm text-primary/70 mt-1">
                        {freeTestQuotaPending ? (
                          <span className="font-semibold">Checking your test quota...</span>
                        ) : freeTestQuotaReached ? (
                          <span className="font-semibold">Limit reached! Upgrade for unlimited tests.</span>
                        ) : (
                          <span>View plans for unlimited mock tests!</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => navigate('/subscription-plans')}
                    className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm px-4 py-2 rounded-xl"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade Now
                  </Button>
                </div>
              </div>
            )}
            {/* Group Test Buttons - Pro only */}
            {hasProAccess && (
              <div className="mb-6 p-4 rounded-2xl bg-linear-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="bg-emerald-600 p-2 rounded-xl shrink-0">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-emerald-900 text-sm sm:text-base">Group Test</p>
                      <p className="text-xs sm:text-sm text-emerald-700/70">Create a test & share with friends via WhatsApp/QR code</p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      onClick={() => navigate('/group-test/create')}
                      className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Create
                    </Button>
                    <Button
                      onClick={() => navigate('/group-test/join')}
                      variant="outline"
                      className="flex-1 sm:flex-none border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-sm"
                    >
                      Join
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <div className={testGridClass}>
              <div 
                className="group relative rounded-2xl bg-white border-2 border-primary/20 hover:border-primary/40 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:bg-primary/5 dark:bg-slate-900 dark:border-slate-700"
                onClick={() => setTestMode("chapter")}
              >
                <div className="p-4 sm:p-5 text-center h-full flex flex-col justify-between">
                  <div>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 bg-linear-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <BookOpen className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                    </div>

                    <h3 className="text-base sm:text-lg font-bold mb-1 sm:mb-2 text-foreground">
                      Chapter-wise Test
                    </h3>
                    <div className="space-y-1.5 mb-3 sm:mb-4">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                        </div>
                        <div className="text-left text-xs sm:text-sm">
                          <span className="text-foreground font-bold">25</span>
                          <span className="text-muted-foreground"> Questions</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600" />
                        </div>
                        <div className="text-left text-xs sm:text-sm">
                          <span className="text-foreground font-bold">60</span>
                          <span className="text-muted-foreground"> Minutes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                   
                  <div className="flex flex-col gap-2 sm:gap-2.5">
                    <Button className="w-full bg-linear-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold py-1.5 sm:py-2 rounded-lg shadow-md transition-all duration-300 text-xs sm:text-sm h-8 sm:h-9">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Select Chapters
                    </Button>
                  </div>
                </div>
              </div>

              <div 
                className="group relative rounded-2xl bg-white border-2 border-purple-200 hover:border-purple-400 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:bg-purple-50/50 dark:bg-slate-900 dark:border-slate-700"
                onClick={() => setTestMode("subject")}
              >

                <div className="p-4 sm:p-5 text-center h-full flex flex-col justify-between">
                  <div>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 bg-linear-to-br from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <Target className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                    </div>
                    
                    <h3 className="text-base sm:text-lg font-bold mb-1 sm:mb-2 text-foreground">
                      Subject-wise Test
                    </h3>
                    <div className="space-y-1.5 mb-3 sm:mb-4">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
                        </div>
                        <div className="text-left text-xs sm:text-sm">
                          <span className="text-foreground font-bold">25</span>
                          <span className="text-muted-foreground"> Questions</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-pink-100 flex items-center justify-center shrink-0">
                          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-600" />
                        </div>
                        <div className="text-left text-xs sm:text-sm">
                          <span className="text-foreground font-bold">60</span>
                          <span className="text-muted-foreground"> Minutes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                   
                  <div className="flex flex-col gap-2 sm:gap-2.5">
                    <Button className="w-full bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-600/90 hover:to-indigo-600/90 text-white font-semibold py-1.5 sm:py-2 rounded-lg shadow-md transition-all duration-300 text-xs sm:text-sm h-8 sm:h-9">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Select Subjects
                    </Button>
                  </div>
                </div>
              </div>

              <div 
                className="group relative rounded-2xl bg-white border-2 border-orange-200 hover:border-orange-400 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl hover:bg-orange-50/50 dark:bg-slate-900 dark:border-slate-700"
                onClick={() => {
                  if (freeTestQuotaPending || loading) return;
                  void startTest("full");
                }}
              >
                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10">
                  <Badge className="bg-linear-to-r from-yellow-500 to-orange-500 text-white border-0 shadow-md text-xs">
                    <Award className="w-3 h-3 mr-0.5" />
                    Most Popular
                  </Badge>
                </div>

                <div className="p-4 sm:p-5 text-center h-full flex flex-col justify-between pt-6 sm:pt-5">
                  <div>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 bg-linear-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mx-auto mb-2 sm:mb-3 group-hover:scale-110 transition-transform duration-300">
                      <Trophy className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                    </div>

                    <h3 className="text-base sm:text-lg font-bold mb-1 sm:mb-2 text-foreground">
                      Full Syllabus Mock
                    </h3>
                    <div className="space-y-1.5 mb-3 sm:mb-4">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600" />
                        </div>
                        <div className="text-left text-xs sm:text-sm">
                          <span className="text-foreground font-bold">
                            {(() => {
                              const te = profile?.target_exam || 'JEE';
                              const pn = te === 'JEE' ? 'JEE Mains' : te;
                              return getExamPattern(pn).totalQuestions;
                            })()}
                          </span>
                          <span className="text-muted-foreground"> Qs</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
                        </div>
                        <div className="text-left text-xs sm:text-sm">
                          <span className="text-foreground font-bold">
                            {(() => {
                              const te = profile?.target_exam || 'JEE';
                              const pn = te === 'JEE' ? 'JEE Mains' : te;
                              return getExamPattern(pn).duration;
                            })()}
                          </span>
                          <span className="text-muted-foreground"> mins</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:gap-2.5">
                    <Button
                      className="w-full bg-linear-to-r from-orange-600 to-red-600 hover:from-orange-600/90 hover:to-red-600/90 text-white font-semibold py-1.5 sm:py-2 rounded-lg shadow-md transition-all duration-300 text-xs sm:text-sm h-8 sm:h-9"
                      disabled={freeTestQuotaPending || freeTestQuotaReached || loading}
                      onClick={(event) => {
                        event.stopPropagation();
                        void startTest("full");
                      }}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Start Mock Test
                    </Button>
                  </div>
                </div>
                </div>

              {/* PYQ Mock Test Card - Pro only */}
              {hasProAccess && (
                <div
                  className="group relative overflow-hidden rounded-2xl bg-white border-2 border-amber-200 hover:border-amber-400 hover:scale-105 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl dark:bg-slate-900 dark:border-slate-700"
                  onClick={() => {
                    if (freeTestQuotaPending) return;
                    setTestMode('pyq');
                  }}
                >
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
                    <Badge className="bg-linear-to-r from-amber-500 to-yellow-500 text-white border-0 shadow-md text-xs">
                      <Calendar className="w-3 h-3 mr-1" />
                      Exam Ready
                    </Badge>
                  </div>

                  <div className="p-4 sm:p-6 text-center">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-linear-to-br from-amber-500 to-yellow-600 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 group-hover:scale-110 transition-transform duration-300">
                      <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </div>

                    <h3 className="text-lg sm:text-2xl font-bold mb-2 text-foreground">PYQ Mock Test</h3>
                    <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                        </div>
                        <div className="text-left">
                          <div className="text-foreground font-bold text-sm sm:text-base">
                            {(() => {
                              const te = profile?.target_exam || 'JEE';
                              const pn = te === 'JEE' ? 'JEE Mains' : te;
                              return getExamPattern(pn).totalQuestions;
                            })()}
                          </div>
                          <div className="text-muted-foreground text-xs">Questions</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                        </div>
                        <div className="text-left">
                          <div className="text-foreground font-bold text-sm sm:text-base">
                            {(() => {
                              const te = profile?.target_exam || 'JEE';
                              const pn = te === 'JEE' ? 'JEE Mains' : te;
                              return getExamPattern(pn).duration;
                            })()}
                          </div>
                          <div className="text-muted-foreground text-xs">Minutes</div>
                        </div>
                      </div>
                    </div>

                    <Button className="w-full bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-500/90 hover:to-yellow-600/90 text-white font-semibold py-2 sm:py-3 rounded-xl shadow-md transition-all duration-300 text-sm sm:text-base">
                      <Calendar className="w-4 h-4 mr-2" />
                      Select Exam & Year
                    </Button>

                    <Badge className="mt-3 sm:mt-4 bg-amber-50 text-amber-700 border-amber-200 text-xs dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/60">Past Year Papers</Badge>
                  </div>
                </div>
              )}
              </div>

            {testHistoryEnabled && (
              <div className="mt-6 sm:mt-8">
                {testHistorySection()}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }



  if (testMode === "chapter") {
    return (
      <div className="mobile-app-shell bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 min-h-0 overflow-y-auto py-4 sm:py-6">
          <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-6xl">
            
            <Button 
              variant="outline"
              className="mb-4 sm:mb-6 border-2 border-primary text-sm"
              onClick={() => {
                setTestMode("");
                setSelectedSubject("");
                setSelectedChapters([]);
                setAvailableChapters([]);
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Test Selection
            </Button>

            <Card className="border-2 border-primary/20 shadow-lg bg-white overflow-hidden dark:bg-slate-900 dark:border-slate-700">
              <CardHeader className="bg-linear-to-r from-primary/10 to-blue-50 border-b border-primary/20 p-4 sm:p-6 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
                <CardTitle className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br from-primary to-blue-600 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <span className="text-base sm:text-3xl">Chapter-wise Test Setup</span>
                </CardTitle>
                <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs sm:text-base">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500" />
                  Select subjects first, then choose specific chapters
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="mb-6 sm:mb-8">
                  <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-foreground flex items-center gap-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-linear-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                      1
                    </div>
                    <span className="text-sm sm:text-xl">Select Subjects</span>
                  </h3>
                  <FilterPills
                    options={availableSubjects}
                    selected={selectedSubject}
                    onSelect={handleSubjectToggle}
                  />
                </div>

                {selectedSubject && loadingChapters && (
                  <div className="mb-6 sm:mb-8 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
                    Loading chapters for {selectedSubject}...
                  </div>
                )}

                {selectedSubject && !loadingChapters && (
                  <div className="mb-6 sm:mb-8">
                    <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 text-foreground flex items-center gap-2">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-linear-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
                        2
                      </div>
                      <span className="text-sm sm:text-xl">Select Chapters</span>
                      <Badge className="ml-auto bg-primary/10 text-primary border-primary/20 text-xs">
                        {selectedChapters.length} selected
                      </Badge>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3 max-h-[400px] overflow-y-auto pr-2">
                      {availableChapters.map(({ id, subject, chapter }) => (
                        <div 
                          key={id}
                          className={`p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                            selectedChapters.some(ch => ch.id === id)
                                ? 'border-purple-500 bg-purple-50 shadow-xs dark:bg-purple-950/30 dark:border-purple-500/60'
                                : 'border-gray-200 bg-white hover:border-purple-300 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-purple-500/60'
                          }`}
                          onClick={() => handleChapterToggle({ id, subject, chapter })}
                        >
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              checked={selectedChapters.some(ch => ch.id === id)}
                              className="w-4 h-4 shrink-0"
                            />
                            <label className="cursor-pointer flex-1 min-w-0">
                              <span className="font-semibold text-foreground block text-xs sm:text-sm truncate">{chapter}</span>
                              <Badge variant="outline" className="text-[10px] mt-0.5">
                                {subject}
                              </Badge>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedChapters.length > 0 && !loadingChapters && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 rounded-xl bg-linear-to-r from-primary/10 to-purple-50 border-2 border-primary/20 shadow-md gap-3 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
                    <div>
                      <p className="font-bold text-xl sm:text-2xl text-foreground mb-2">
                        {selectedChapters.length} Chapter{selectedChapters.length > 1 ? 's' : ''} Selected
                      </p>
                      <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="font-medium">25 Questions</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="font-medium">60 Minutes</span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={() => startTest("chapter")}
                      className="w-full sm:w-auto bg-linear-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md text-sm sm:text-base"
                      disabled={freeTestQuotaPending || freeTestQuotaReached}
                    >
                      <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Start Test Now
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (testMode === "subject") {
    return (
      <div className="mobile-app-shell bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 min-h-0 overflow-y-auto py-4 sm:py-6">
          <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-6xl">
            
            <Button 
              variant="outline"
              className="mb-4 sm:mb-6 border-2 border-primary text-sm"
              onClick={() => {
                setTestMode("");
                setSelectedSubject("");
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Test Selection
            </Button>

            <Card className="border-2 border-primary/20 shadow-lg bg-white overflow-hidden dark:bg-slate-900 dark:border-slate-700">
              <CardHeader className="bg-linear-to-r from-purple-50 to-pink-50 border-b border-purple-200 p-4 sm:p-6 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
                <CardTitle className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-linear-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                    <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <span className="text-base sm:text-3xl">Subject-wise Test Setup</span>
                </CardTitle>
                <p className="text-muted-foreground mt-2 flex items-center gap-2 text-xs sm:text-base">
                  <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600" />
                  Choose subjects to test your understanding
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="mb-6 sm:mb-8">
                  <FilterPills
                    options={availableSubjects}
                    selected={selectedSubject}
                    onSelect={handleSubjectToggle}
                  />
                </div>

                {selectedSubject && !loadingChapters && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 rounded-xl bg-linear-to-r from-purple-50 to-pink-50 border-2 border-purple-200 shadow-md gap-3 dark:from-slate-900 dark:to-slate-800 dark:border-slate-700">
                    <div>
                      <p className="font-bold text-xl sm:text-2xl text-foreground mb-2">
                        1 Subject Selected
                      </p>
                      <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="font-medium">25 Questions</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                          <span className="font-medium">60 Minutes</span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={() => startTest("subject")}
                      className="w-full sm:w-auto bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-600/90 hover:to-pink-600/90 text-white font-semibold px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-md text-sm sm:text-base"
                      disabled={freeTestQuotaPending || freeTestQuotaReached}
                    >
                      <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                      Start Test Now
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default TestPage;

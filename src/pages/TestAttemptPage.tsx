import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import LoadingScreen from '@/components/ui/LoadingScreen';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import safeLocalStorage from '@/utils/safeStorage';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Flag,
  BookOpen,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { testsAPI } from "@/services/api";
import { logger } from "@/utils/logger";
import { toast } from "sonner";
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import { MathDisplay } from "@/components/admin/MathDisplay";
import { QuestionReportDialog, ReportButton } from '@/components/QuestionReportDialog';
import 'katex/dist/katex.min.css';

interface Question {
  id: string;
  question: string;
  question_text?: string | null;
  question_image_url?: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  correct_options?: string[] | null;
  question_type?: string | null;
  numerical_answer?: number | null;
  numerical_tolerance?: number | null;
  explanation?: string;
  topic?: string;
  chapter?: string;
  difficulty?: string;
  subjects?: { name: string };
}

// Encode a multi-correct selection (e.g. ['A','C']) into a stored string "A,C"
const encodeMulti = (letters: string[]) => letters.slice().sort().join(',');
// Encode a numerical answer as "NUM:<value>"
const encodeNumerical = (v: string | number) => `NUM:${v}`;
const isNumericalSel = (s: string) => typeof s === 'string' && s.startsWith('NUM:');

interface TestSession {
  id: string;
  title: string;
  subject?: string;
  questions: Question[];
  duration: number;
  startTime: string;
  groupTestId?: string;
  groupTestCode?: string;
  examPattern?: string;
  sessionId?: string;
}

interface UserAnswer {
  questionId: string;
  selectedOption: string;
  timeSpent: number;
  isMarkedForReview: boolean;
}

const LOCAL_TEST_HISTORY_KEY = 'local_test_history_v1';

const normalizeTestSession = (session: TestSession): TestSession => ({
  ...session,
  questions: Array.isArray(session.questions) ? session.questions : [],
});

const TestAttemptPage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [testSession, setTestSession] = useState<TestSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<{ [key: string]: UserAnswer }>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [reportingQuestionId, setReportingQuestionId] = useState<string | null>(null);
  const submitRef = React.useRef<(() => void) | undefined>(undefined);

  // Keep submitRef updated so the timer always calls the latest version
  submitRef.current = () => handleSubmitTest();

  // ── Test Strictness: prevent back navigation & tab close ──
  useEffect(() => {
    if (testSubmitted) return;

    // Warn on tab close / refresh
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    // Intercept browser back button
    const handlePopState = () => {
      // Push state back so the user stays on the page
      window.history.pushState(null, '', window.location.href);
      setShowExitDialog(true);
    };

    // Push an extra history entry so "back" fires popstate instead of leaving
    window.history.pushState(null, '', window.location.href);

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [testSubmitted]);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error("Please login to attempt tests");
      navigate("/login");
      return;
    }

    const locationTest = (location.state as { currentTest?: TestSession } | null)?.currentTest;
    if (locationTest) {
      const hydrateFromSession = async () => {
        try {
          const canonicalSession = locationTest.sessionId
            ? await testsAPI.getTestSession(locationTest.sessionId)
            : null;

          const resolvedSession = canonicalSession?.data?.session
            ? normalizeTestSession({
                ...locationTest,
                ...canonicalSession.data.session,
                questions: canonicalSession.data.questions?.length ? canonicalSession.data.questions : locationTest.questions,
              })
            : normalizeTestSession(locationTest);

          const resolvedQuestions = resolvedSession.questions || [];
          if (resolvedQuestions.length === 0) {
            throw new Error('No questions returned from database');
          }

          try {
            safeLocalStorage.setItem('currentTest', JSON.stringify(resolvedSession));
          } catch {
            // Ignore persistence failures; router state is enough to start.
          }

          setTestSession(resolvedSession);

          const startTime = new Date(resolvedSession.startTime).getTime();
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = Math.max(0, resolvedSession.duration * 60 - elapsed);
          setTimeRemaining(remaining);

          if (remaining === 0) {
            setTestSubmitted(true);
            toast.info("Test time expired. Auto-submitting...");
            setTimeout(() => submitRef.current?.(), 0);
          }

          setQuestionStartTime(Date.now());
        } catch (error) {
          logger.error('Failed to hydrate test session from database', error);
          try {
            safeLocalStorage.setItem('currentTest', JSON.stringify(locationTest));
          } catch {
            // Ignore persistence failures; router state is enough to start.
          }
          setTestSession(normalizeTestSession(locationTest));

          const startTime = new Date(locationTest.startTime).getTime();
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = Math.max(0, locationTest.duration * 60 - elapsed);
          setTimeRemaining(remaining);
          setQuestionStartTime(Date.now());
        }
      };

      void hydrateFromSession();
      return;
    }

    const savedTest = safeLocalStorage.getItem("currentTest");
    if (savedTest) {
      try {
        const testData: TestSession = normalizeTestSession(JSON.parse(savedTest));

        const hydrateFromSession = async () => {
          const canonicalSession = testData.sessionId
            ? await testsAPI.getTestSession(testData.sessionId)
            : null;

          const resolvedSession = canonicalSession?.data?.session
            ? normalizeTestSession({
                ...testData,
                ...canonicalSession.data.session,
                questions: canonicalSession.data.questions?.length ? canonicalSession.data.questions : testData.questions,
              })
            : testData;

          if (!resolvedSession.questions || resolvedSession.questions.length === 0) {
            throw new Error('No questions returned from database');
          }

          setTestSession(resolvedSession);

          const startTime = new Date(resolvedSession.startTime).getTime();
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = Math.max(0, resolvedSession.duration * 60 - elapsed);
        setTimeRemaining(remaining);

        // If time has already expired, auto-submit immediately
        if (remaining === 0) {
          setTestSubmitted(true);
          toast.info("Test time expired. Auto-submitting...");
          // Defer submission to next tick so state is set
          setTimeout(() => submitRef.current?.(), 0);
        }

          setQuestionStartTime(Date.now());
        };

        void hydrateFromSession();
      } catch (e) {
        logger.error('Failed to parse saved test data:', e);
        safeLocalStorage.removeItem('currentTest');
        toast.error("Test data was corrupted. Please start a new test.");
        navigate("/tests");
      }
    } else {
      toast.error("No test session found");
      navigate("/tests");
    }
  }, [location.state, testId, isAuthenticated, navigate]);

  useEffect(() => {
    if (timeRemaining > 0 && !testSubmitted) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Use ref to call latest version of submit (no stale closure)
            submitRef.current?.();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining > 0, testSubmitted]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAnswerSelect = async (option: string) => {
    if (!testSession) return;

    const currentQuestion = testSession.questions[currentQuestionIndex];
    const qType = currentQuestion.question_type || 'single_correct';
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);

    // For multi-correct: toggle option in/out of selection
    if (qType === 'multi_correct') {
      setUserAnswers((prev) => {
        const prevSel = prev[currentQuestion.id]?.selectedOption || '';
        const set = new Set(prevSel ? prevSel.split(',').filter(Boolean) : []);
        if (option === '') {
          set.clear();
        } else if (set.has(option)) {
          set.delete(option);
        } else {
          set.add(option);
        }
        return {
          ...prev,
          [currentQuestion.id]: {
            questionId: currentQuestion.id,
            selectedOption: encodeMulti(Array.from(set)),
            timeSpent,
            isMarkedForReview: prev[currentQuestion.id]?.isMarkedForReview || false,
          },
        };
      });
      return;
    }

    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        selectedOption: option,
        timeSpent,
        isMarkedForReview: prev[currentQuestion.id]?.isMarkedForReview || false,
      },
    }));
  };

  const handleNumericalChange = (value: string) => {
    if (!testSession) return;
    const currentQuestion = testSession.questions[currentQuestionIndex];
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        questionId: currentQuestion.id,
        selectedOption: value.trim() === '' ? '' : encodeNumerical(value.trim()),
        timeSpent,
        isMarkedForReview: prev[currentQuestion.id]?.isMarkedForReview || false,
      },
    }));
  };

  const handleMarkForReview = () => {
    if (!testSession) return;

    const currentQuestion = testSession.questions[currentQuestionIndex];
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        ...prev[currentQuestion.id],
        questionId: currentQuestion.id,
        selectedOption: prev[currentQuestion.id]?.selectedOption || "",
        timeSpent: prev[currentQuestion.id]?.timeSpent || 0,
        isMarkedForReview: !prev[currentQuestion.id]?.isMarkedForReview,
      },
    }));
  };

  const navigateQuestion = (direction: "next" | "prev" | number) => {
    if (!testSession) return;

    let newIndex: number;
    if (typeof direction === "number") {
      newIndex = direction;
    } else {
      newIndex =
        direction === "next"
          ? Math.min(currentQuestionIndex + 1, testSession.questions.length - 1)
          : Math.max(currentQuestionIndex - 1, 0);
    }

    setCurrentQuestionIndex(newIndex);
    setQuestionStartTime(Date.now());
  };

  const handleSubmitTest = async () => {
    if (!testSession || !user) return;

    try {
      setTestSubmitted(true);

      let correctAnswers = 0;
      let totalAnswered = 0;
      let totalTimeSpent = 0;

      const results = [];
      
      for (const question of testSession.questions) {
        const userAnswer = userAnswers[question.id];
        
        let isCorrect = false;
        let correctOption = '';
        
        if (userAnswer?.selectedOption) {
          totalAnswered++;
          totalTimeSpent += userAnswer.timeSpent;

          try {
            const sel = userAnswer.selectedOption;
            let rpcArgs: { p_question_id: string; p_selected_options: string[] | null; p_numerical_answer: number | null };
            if (isNumericalSel(sel)) {
              const v = parseFloat(sel.slice(4));
              rpcArgs = { p_question_id: question.id, p_selected_options: null, p_numerical_answer: Number.isFinite(v) ? v : null };
            } else {
              const letters = sel.split(',').map(s => s.trim()).filter(Boolean);
              rpcArgs = { p_question_id: question.id, p_selected_options: letters, p_numerical_answer: null };
            }
            const { data: rpcData } = await supabase.rpc('validate_practice_answer', rpcArgs);

            if (rpcData && typeof rpcData === 'object') {
              const rpcResult = rpcData as { is_correct: boolean; correct_option?: string; correct_options?: string[]; numerical_answer?: number; explanation?: string };
              isCorrect = rpcResult.is_correct;
              correctOption = rpcResult.numerical_answer != null
                ? String(rpcResult.numerical_answer)
                : (rpcResult.correct_options && rpcResult.correct_options.length > 0
                    ? rpcResult.correct_options.join(',')
                    : (rpcResult.correct_option || ''));
            }

            if (isCorrect) correctAnswers++;
          } catch (validationError) {
            logger.error('Error validating answer:', validationError);
          }
        }

        results.push({
          questionId: question.id,
          selectedOption: userAnswer?.selectedOption || "",
          correctOption: correctOption,
          isCorrect,
          timeSpent: userAnswer?.timeSpent || 0,
          isMarkedForReview: userAnswer?.isMarkedForReview || false,
        });
      }

      const percentage = totalAnswered > 0 ? (correctAnswers / totalAnswered) * 100 : 0;
      let persistedSessionId: string | null = null;
      let attemptInserts: Array<{
        user_id: string;
        question_id: string;
        selected_option: string;
        is_correct: boolean;
        time_spent: number;
        test_session_id: string | null;
        mode: string;
      }> = [];

      const appendLocalHistory = () => {
        try {
          const historyEntry = {
            id: `local-${Date.now()}`,
            title: testSession.title || 'Mock Test',
            status: 'completed',
            score: Math.round(percentage),
            accuracy: Math.round(percentage),
            correct_answers: correctAnswers,
            total_questions: testSession.questions.length,
            time_taken: totalTimeSpent,
            group_test_id: testSession.groupTestId || null,
            completed_at: new Date().toISOString(),
            started_at: testSession.startTime,
            created_at: new Date().toISOString(),
          };

          const existingRaw = safeLocalStorage.getItem(LOCAL_TEST_HISTORY_KEY);
          const existing = existingRaw ? JSON.parse(existingRaw) : [];
          const list = Array.isArray(existing) ? existing : [];
          const merged = [historyEntry, ...list].slice(0, 30);
          safeLocalStorage.setItem(LOCAL_TEST_HISTORY_KEY, JSON.stringify(merged));
        } catch (historyError) {
          logger.error('Failed to persist local test history:', historyError);
        }
      };

      try {
        // Save test session
        const currentSessionId = testSession.sessionId || null;
        const sessionResult = await testsAPI.saveTestSessionLegacy(
          user.id,
          formatSubjectDisplay(testSession.subject, testSession.title),
          testSession.questions.length,
          correctAnswers,
          totalTimeSpent,
          totalAnswered,
          testSession.groupTestId || undefined,
          currentSessionId || undefined
        );

        if (sessionResult.error || !sessionResult.data?.id) {
          throw new Error(sessionResult.error?.message || 'Failed to save test session');
        }

        persistedSessionId = sessionResult.data.id;

        // Save individual test_attempts so questions aren't repeated
        attemptInserts = results
          .filter(r => r.selectedOption)
          .map(r => ({
            user_id: user.id,
            question_id: r.questionId,
            selected_option: r.selectedOption,
            is_correct: r.isCorrect,
            time_spent: r.timeSpent,
            test_session_id: persistedSessionId,
            mode: 'test',
          }));

        if (attemptInserts.length > 0) {
          const { error: attemptsError } = await supabase.from('question_attempts').insert(attemptInserts);
          if (attemptsError) {
            throw attemptsError;
          }
        }

        logger.info('Test results saved to database');
      } catch (dbError) {
        logger.error("Database save error:", dbError);
        testsAPI.queuePendingTestSync({
          userId: user.id,
          subject: formatSubjectDisplay(testSession.subject, testSession.title),
          totalQuestions: testSession.questions.length,
          correctAnswers,
          totalTime: totalTimeSpent,
          attemptedQuestions: totalAnswered,
          groupTestId: testSession.groupTestId || undefined,
          sessionId: persistedSessionId || testSession.sessionId || null,
          attempts: attemptInserts,
        });
        appendLocalHistory();
        toast.error("Cloud save failed. Result is stored locally and visible in Tests history.");
      }

      safeLocalStorage.removeItem("currentTest");

      safeLocalStorage.setItem(
        "testResults",
        JSON.stringify({
          testTitle: testSession.title,
          totalQuestions: testSession.questions.length,
          answeredQuestions: totalAnswered,
          correctAnswers,
          percentage: percentage.toFixed(1),
          timeSpent: totalTimeSpent,
          results,
          questions: testSession.questions,
          completedAt: new Date().toISOString(),
          groupTestCode: testSession.groupTestCode || null,
          examPattern: testSession.examPattern || null,
          sessionId: persistedSessionId || testSession.sessionId || null,
        })
      );

      toast.success("Test submitted successfully!");
      navigate(persistedSessionId ? `/test-results/${persistedSessionId}` : "/test-results");

    } catch (error) {
      logger.error("Test submission failed:", error);
      toast.error("Failed to submit test. Please check your internet connection and try again.");
      setTestSubmitted(false);
    }
  };
  
  const getQuestionStatus = (questionIndex: number) => {
    if (!testSession) return "not-visited";

    const question = testSession.questions[questionIndex];
    const userAnswer = userAnswers[question.id];

    if (!userAnswer) return "not-visited";
    if (userAnswer.isMarkedForReview) return "marked-for-review";
    if (userAnswer.selectedOption) return "answered";
    // Visited but not answered - show as "not-answered"
    return "not-answered";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "answered":
        return "bg-green-500 text-white";
      case "marked-for-review":
        return "bg-yellow-500 text-white";
      case "not-answered":
        return "bg-red-500 text-white";
      default:
        return "bg-muted text-foreground";
    }
  };

  if (!testSession) {
    return <LoadingScreen pageName="Test" message="Loading your test..." />;
  }

  const currentQuestion = testSession.questions[currentQuestionIndex];
  
  // Guard against empty questions array
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">No questions available in this test.</p>
          <Button onClick={() => navigate('/tests')} className="mt-4">Back to Tests</Button>
        </div>
      </div>
    );
  }

  const userAnswer = userAnswers[currentQuestion.id];
  const answeredCount = Object.values(userAnswers).filter((a) => a.selectedOption).length;
  const markedCount = Object.values(userAnswers).filter((a) => a.isMarkedForReview).length;

  return (
    <div className="h-dvh overflow-hidden bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-md border-b p-3 sm:p-4 shrink-0 dark:bg-slate-900 dark:border-slate-700">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExitDialog(true)}
              className="text-xs sm:text-sm"
            >
              <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
              Exit
            </Button>
            <div className="hidden sm:block">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Question {currentQuestionIndex + 1} of {testSession.questions.length}
              </p>
            </div>
          </div>

          {/* Center Branding */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center space-x-2">
            <img 
              src="/logo.png" 
              alt="JEEnie Logo" 
              className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-lg"
            />
            <div>
              <span className="text-lg sm:text-xl font-bold text-primary">JEEnie</span>
            </div>
          </div>

          {/* Timer & Mobile Palette Toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-center">
              <div
                className={`text-base sm:text-xl font-bold transition-all ${
                  timeRemaining < 300 
                    ? "text-red-600 animate-pulse scale-110" 
                    : "text-primary"
                }`}
              >
                {formatTime(timeRemaining)}
              </div>
              <div className="text-xs text-muted-foreground hidden sm:block">Time Left</div>
            </div>

            {/* Mobile Palette Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMobilePalette(!showMobilePalette)}
              className="lg:hidden"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="container mx-auto px-3 sm:px-4 h-full py-2 sm:py-4">
          <div className="grid lg:grid-cols-4 gap-3 sm:gap-4 h-full">
            {/* Question Panel */}
            <div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">
              {/* Question Card */}
              <Card className="flex-1 overflow-y-auto min-h-0 mb-0 dark:bg-slate-900 dark:border-slate-700">
                <CardHeader className="pb-2 sm:pb-3 sticky top-0 bg-card z-5 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base sm:text-lg">
                      Question {currentQuestionIndex + 1}
                    </CardTitle>
                    <ReportButton onClick={() => setReportingQuestionId(currentQuestion.id)} />
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
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

                    // Numerical input
                    if (qType === 'numerical_int' || qType === 'numerical_decimal') {
                      const stored = userAnswer?.selectedOption || '';
                      const numVal = isNumericalSel(stored) ? stored.slice(4) : '';
                      return (
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground font-medium">
                            Enter your numerical answer
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            step={qType === 'numerical_int' ? '1' : 'any'}
                            value={numVal}
                            onChange={(e) => handleNumericalChange(e.target.value)}
                            placeholder="e.g. 42"
                            className="w-full p-3 rounded-lg border-2 border-border bg-background text-base focus:border-primary focus:outline-none"
                          />
                        </div>
                      );
                    }

                    // Multi-correct or single-correct buttons
                    const isMulti = qType === 'multi_correct';
                    const selectedSet = new Set(
                      isMulti
                        ? (userAnswer?.selectedOption || '').split(',').filter(Boolean)
                        : userAnswer?.selectedOption
                          ? [userAnswer.selectedOption]
                          : []
                    );

                    return (
                      <>
                        {isMulti && (
                          <p className="text-xs text-muted-foreground mb-2">Select all correct options</p>
                        )}
                        <div className="space-y-2 sm:space-y-3">
                          {["A", "B", "C", "D"].map((option) => {
                            const optionText = currentQuestion[
                              `option_${option.toLowerCase()}` as keyof Question
                            ] as string;
                            if (!optionText) return null;
                            const isSelected = selectedSet.has(option);

                            return (
                              <button
                                key={option}
                                onClick={() => handleAnswerSelect(option)}
                                className={`w-full p-3 sm:p-4 text-left rounded-lg border-2 transition-all ${
                                  isSelected
                                    ? "border-primary bg-blue-50 text-primary dark:bg-blue-950/30 dark:text-blue-200"
                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                                }`}
                              >
                                <div className="flex items-center space-x-3">
                                  <div
                                    className={`w-5 h-5 sm:w-6 sm:h-6 ${isMulti ? 'rounded' : 'rounded-full'} border-2 flex items-center justify-center text-xs sm:text-sm ${
                                      isSelected
                                        ? "border-primary bg-primary text-white"
                                        : "border-gray-400 dark:border-slate-500"
                                    }`}
                                  >
                                    {isSelected && isMulti ? '✓' : option}
                                  </div>
                                  <span className="text-sm sm:text-base">
                                    <MathDisplay text={optionText} />
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Navigation - fixed at bottom */}
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t bg-white px-3 py-2 sm:py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] dark:bg-slate-900 dark:border-slate-700 dark:shadow-[0_-2px_8px_rgba(0,0,0,0.3)]">
                <Button
                  variant="outline"
                  onClick={() => navigateQuestion("prev")}
                  disabled={currentQuestionIndex === 0}
                  size="sm"
                  className="text-xs sm:text-sm min-w-[90px]"
                >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Prev</span>
                </Button>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={userAnswer?.isMarkedForReview ? "default" : "outline"}
                    onClick={handleMarkForReview}
                    size="sm"
                    className="text-xs sm:text-sm min-w-[84px]"
                  >
                    <Flag className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" />
                    <span className="hidden sm:inline">
                      {userAnswer?.isMarkedForReview ? "Unmark" : "Mark"}
                    </span>
                  </Button>

                  <Button
                    onClick={() => handleAnswerSelect("")}
                    variant="outline"
                    size="sm"
                    className="text-xs sm:text-sm hidden sm:flex min-w-[72px]"
                  >
                    Clear
                  </Button>
                </div>

                {currentQuestionIndex === testSession.questions.length - 1 ? (
                  <Button
                    onClick={handleSubmitTest}
                    className="bg-green-600 hover:bg-green-700"
                    size="sm"
                    type="button"
                  >
                    <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                    Submit
                  </Button>
                ) : (
                  <Button
                    onClick={() => navigateQuestion("next")}
                    className="bg-primary"
                    size="sm"
                    type="button"
                  >
                    Next
                    <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            {/* Desktop Sidebar - Question Palette */}
            <div className="hidden lg:flex flex-col h-full">
              <Card className="flex-1 overflow-y-auto">
                <CardHeader>
                  <CardTitle className="text-base">Question Palette</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`grid gap-1.5 mb-4 ${
                    testSession.questions.length > 50 ? 'grid-cols-10' : 'grid-cols-5'
                  }`}>
                    {testSession.questions.map((_, index) => {
                      const status = getQuestionStatus(index);
                      const isCurrent = index === currentQuestionIndex;

                      return (
                        <button
                          key={index}
                          onClick={() => navigateQuestion(index)}
                          className={`${
                            testSession.questions.length > 50 ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs'
                          } rounded border-2 transition-all ${
                            isCurrent
                              ? "border-primary scale-110"
                              : "border-transparent"
                          } ${getStatusColor(status)}`}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-green-500 rounded"></div>
                      <span>Answered</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                      <span>Marked</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-red-500 rounded"></div>
                      <span>Not Answered</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-gray-200 rounded dark:bg-slate-700"></div>
                      <span>Not Visited</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="font-bold text-green-600">{answeredCount}</div>
                        <div className="text-xs">Done</div>
                      </div>
                      <div>
                        <div className="font-bold text-yellow-600">{markedCount}</div>
                        <div className="text-xs">Marked</div>
                      </div>
                      <div>
                        <div className="font-bold text-muted-foreground">
                          {testSession.questions.length - answeredCount}
                        </div>
                        <div className="text-xs">Left</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Submit Button */}
              <Button
                onClick={handleSubmitTest}
                className="w-full bg-green-600 hover:bg-green-700 mt-3"
                size="lg"
              >
                <Trophy className="w-4 h-4 mr-2" />
                Submit Test
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Question Palette Slider */}
      {showMobilePalette && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowMobilePalette(false)}
        >
          <div 
            className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto dark:bg-slate-900 dark:shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Question Palette</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMobilePalette(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Question Grid */}
              <div className={`grid gap-2 mb-4 ${
                testSession.questions.length > 50 ? 'grid-cols-6' : 'grid-cols-5'
              }`}>
                {testSession.questions.map((_, index) => {
                  const status = getQuestionStatus(index);
                  const isCurrent = index === currentQuestionIndex;

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        navigateQuestion(index);
                        setShowMobilePalette(false);
                      }}
                      className={`${
                        testSession.questions.length > 50 ? 'w-10 h-10 text-xs' : 'w-12 h-12 text-sm'
                      } rounded border-2 transition-all ${
                        isCurrent
                          ? "border-primary scale-110 ring-2 ring-primary"
                          : "border-transparent"
                      } ${getStatusColor(status)}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="space-y-2 text-sm mb-4 pb-4 border-b">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-green-500 rounded"></div>
                  <span>Answered</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-yellow-500 rounded"></div>
                  <span>Marked for Review</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-red-500 rounded"></div>
                  <span>Not Answered</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-muted rounded"></div>
                  <span>Not Visited</span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg">
                  <div className="font-bold text-xl text-green-600">{answeredCount}</div>
                  <div className="text-xs text-muted-foreground">Done</div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg">
                  <div className="font-bold text-xl text-yellow-600">{markedCount}</div>
                  <div className="text-xs text-muted-foreground">Marked</div>
                </div>
                <div className="bg-muted/60 dark:bg-muted/30 p-3 rounded-lg">
                  <div className="font-bold text-xl text-muted-foreground">
                    {testSession.questions.length - answeredCount}
                  </div>
                  <div className="text-xs text-muted-foreground">Left</div>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                onClick={() => {
                  setShowMobilePalette(false);
                  handleSubmitTest();
                }}
                className="w-full bg-green-600 hover:bg-green-700 mt-4"
                size="lg"
              >
                <Trophy className="w-4 h-4 mr-2" />
                Submit Test
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center text-base sm:text-lg">
                <AlertCircle className="w-5 h-5 mr-2 text-orange-500" />
                Exit Test?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Are you sure you want to exit? Your test will be <strong>auto-submitted</strong> with your current answers.
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Answered: {Object.values(userAnswers).filter(a => a.selectedOption).length} / {testSession?.questions.length || 0}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowExitDialog(false)}
                  className="flex-1 text-sm"
                >
                  Continue Test
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setShowExitDialog(false);
                    handleSubmitTest();
                  }}
                  className="flex-1 text-sm"
                >
                  Submit & Exit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report Dialog */}
      {reportingQuestionId && (
        <QuestionReportDialog
          questionId={reportingQuestionId}
          questionText={currentQuestion?.question}
          onClose={() => setReportingQuestionId(null)}
        />
      )}
    </div>
  );
};

export default TestAttemptPage;

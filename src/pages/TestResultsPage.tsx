import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "@/components/Header";
import LoadingScreen from '@/components/ui/LoadingScreen';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { downloadQuestionPaperPdf } from "@/lib/questionPaperPdf";
import { MathDisplay } from "@/components/admin/MathDisplay";
import { logger } from "@/utils/logger";
import { testsAPI } from "@/services/api";
import safeLocalStorage from '@/utils/safeStorage';
import {
  Trophy, Target, Clock, CheckCircle, XCircle, BarChart3,
  TrendingUp, BookOpen, ArrowLeft, Eye, FileText,
  MessageCircle, RefreshCw, ImageIcon,
} from "lucide-react";
import ShareCardDialog from "@/components/ShareCardDialog";
import ReferralService from "@/services/referralService";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlag } from "@/contexts/FeatureFlagContext";
import type { ShareCardOpts } from "@/lib/shareCard";

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
}

const isNumericalSel = (s?: string | null) => typeof s === 'string' && s.startsWith('NUM:');

interface TestResult {
  testTitle: string;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  percentage: string;
  timeSpent: number;
  completedAt?: string;
  questions?: Question[];
  results: Array<{
    questionId: string;
    selectedOption: string;
    correctOption: string;
    isCorrect: boolean;
    timeSpent: number;
    isMarkedForReview: boolean;
  }>;
}

const TestResultsPage = () => {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [shareCardOpen, setShareCardOpen] = useState(false);
  const [shareCardOpts, setShareCardOpts] = useState<ShareCardOpts | null>(null);
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const shareCardEnabled = useFeatureFlag('share_card');

  const buildSessionResult = (sessionData: NonNullable<Awaited<ReturnType<typeof testsAPI.getTestSession>>['data']>) => {
    if (!sessionData) return;

    const answerMap = sessionData.answers || {};
    const questions = sessionData.questions || [];
    const results = questions.map((question) => {
      const answer = answerMap[question.id];
      const correctDisplay = question.numerical_answer != null
        ? String(question.numerical_answer)
        : (question.correct_options && question.correct_options.length > 0
            ? question.correct_options.join(',')
            : (question.correct_option || ''));
      return {
        questionId: question.id,
        selectedOption: answer?.selectedOption || "",
        correctOption: correctDisplay,
        isCorrect: answer?.isCorrect || false,
        timeSpent: answer?.timeSpent || 0,
        isMarkedForReview: false,
      };
    });

    const computedCorrect = results.filter(r => r.isCorrect).length;
    const computedAnswered = results.filter(r => r.selectedOption).length;
    const accuracyPct = computedAnswered > 0 ? (computedCorrect / computedAnswered) * 100 : 0;

    setTestResult({
      testTitle: sessionData.session.title || 'Test',
      totalQuestions: sessionData.session.total_questions || questions.length,
      answeredQuestions: sessionData.session.attempted_questions || computedAnswered,
      correctAnswers: sessionData.session.correct_answers || computedCorrect,
      // Use computed accuracy — `session.score` is a marks-based score and would
      // mis-label as "Accuracy" if reused here.
      percentage: accuracyPct.toFixed(1),
      timeSpent: sessionData.session.time_taken || 0,
      completedAt: sessionData.session.completed_at || sessionData.session.started_at || sessionData.session.created_at,
      questions,
      results,
      examPattern: (sessionData.session as any).exam_pattern || undefined,
    } as any);
  };

  useEffect(() => {
    const loadResults = async () => {
      try {
        // Prefer localStorage first — it has full results (selectedOption, correctOption, questions)
        // needed for negative-marking calc and detailed review. Server-side answers table may be empty.
        const savedResults = safeLocalStorage.getItem("testResults");
        if (savedResults) {
          const parsed = JSON.parse(savedResults) as TestResult & { sessionId?: string };
          if (!sessionId || parsed.sessionId === sessionId) {
            setTestResult(parsed);
            return;
          }
        }

        if (sessionId) {
          const { data, error } = await testsAPI.getTestSession(sessionId);
          if (data && !error) {
            buildSessionResult(data);
            return;
          }
        }

        navigate("/tests");
      } catch {
        navigate("/tests");
      } finally {
        setIsLoading(false);
      }
    };

    loadResults();
  }, [navigate, sessionId]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getPerformanceLevel = (percentage: number) => {
    if (percentage >= 90) return { label: "Excellent", color: "text-green-600", bg: "bg-green-100" };
    if (percentage >= 75) return { label: "Good", color: "text-blue-600", bg: "bg-blue-100" };
    if (percentage >= 60) return { label: "Average", color: "text-yellow-600", bg: "bg-yellow-100" };
    if (percentage >= 40) return { label: "Below Average", color: "text-orange-600", bg: "bg-orange-100" };
    return { label: "Needs Improvement", color: "text-red-600", bg: "bg-red-100" };
  };

  const calculateStats = () => {
    if (!testResult) return null;

    const correctAnswers = testResult.correctAnswers;
    const incorrectAnswers = testResult.results.filter(r => !r.isCorrect && r.selectedOption).length;
    const skippedQuestions = testResult.results.filter(r => !r.selectedOption).length;

    // Resolve marking scheme by exam pattern. Default to JEE Mains-style
    // (+4 / -1) only for known competitive patterns; custom/foundation tests
    // use raw scoring so we don't fabricate negative marks.
    const pattern = String((testResult as any).examPattern || '').toLowerCase();
    const marking = pattern.includes('jee') || pattern.includes('neet')
      ? { positive: 4, negative: -1 }
      : pattern.includes('foundation') || pattern.includes('custom') || pattern === ''
        ? { positive: 1, negative: 0 }
        : { positive: 4, negative: -1 };

    const earnedMarks = correctAnswers * marking.positive + incorrectAnswers * marking.negative;
    const totalMarks = testResult.totalQuestions * marking.positive;
    const accuracy = testResult.answeredQuestions > 0
      ? ((testResult.correctAnswers / testResult.answeredQuestions) * 100).toFixed(1) : "0";
    const attemptRate = ((testResult.answeredQuestions / testResult.totalQuestions) * 100).toFixed(1);
    const avgTimePerQuestion = testResult.answeredQuestions > 0
      ? Math.round(testResult.timeSpent / testResult.answeredQuestions) : 0;
    const scorePercentage = totalMarks > 0 ? ((earnedMarks / totalMarks) * 100).toFixed(1) : "0";

    return { accuracy, attemptRate, avgTimePerQuestion, earnedMarks, totalMarks, scorePercentage, correctAnswers, incorrectAnswers, skippedQuestions, marking };
  };

  const getTestDate = () => {
    const date = testResult?.completedAt ? new Date(testResult.completedAt) : new Date();
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handleWhatsAppShare = () => {
    if (!testResult) return;
    const stats = calculateStats();
    const performance = getPerformanceLevel(parseFloat(stats?.scorePercentage || "0"));

    const message = `📊 *TEST RESULT* 🗓️ ${getTestDate()}

🎯 *${testResult.testTitle}*

🏆 Score: *${stats?.earnedMarks}/${stats?.totalMarks}* (${stats?.scorePercentage}%)
✅ Correct: ${stats?.correctAnswers}
❌ Wrong: ${stats?.incorrectAnswers}
⏱️ Time: ${formatTime(testResult.timeSpent)}
🎯 Accuracy: ${stats?.accuracy}%

🔥 *${performance.label} Performance!*

🧞‍♂️ _Powered by JEEnie — AI-Powered JEE/NEET Prep_
🚀 https://www.jeenie.website`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
  };

  const generateQuestionPaperPDF = async () => {
    if (!testResult?.questions?.length) {
      toast.error("Question details are not available for this test.");
      return;
    }

    toast.info("Generating PDF... please wait");

    try {
      await downloadQuestionPaperPdf({
        testTitle: testResult.testTitle,
        testDate: getTestDate(),
        totalQuestions: testResult.totalQuestions,
        questions: testResult.questions,
      });

      toast.success("Question paper downloaded!");
    } catch (error) {
      logger.error("PDF generation error:", error);
      toast.error("Failed to generate PDF. Please try again.");
    }
  };

  if (isLoading || !testResult) {
    return <LoadingScreen pageName="Test Results" message="Loading your results..." />;
  }

  const stats = calculateStats();
  const performance = getPerformanceLevel(parseFloat(stats?.scorePercentage || "0"));

  return (
    <div className="mobile-app-shell bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto py-4 sm:py-6">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8">
          {/* Header */}
          <div className="mb-4 sm:mb-6 md:mb-8">
            <Button variant="outline" onClick={() => navigate("/tests")} size="sm" className="mb-3 sm:mb-4 hover:bg-primary hover:text-white transition-all text-xs sm:text-sm">
              <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Back
            </Button>
            <div className="text-center">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-linear-to-r from-primary via-blue-600 to-indigo-700 bg-clip-text text-transparent mb-1 sm:mb-2">
                Test Results 📊
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{testResult.testTitle}</p>
            </div>
          </div>

          {/* Results Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            <Card className="bg-linear-to-br from-primary via-blue-600 to-indigo-700 text-white sm:col-span-2 lg:col-span-2 border-0 shadow-xl">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <Trophy className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 opacity-90" />
                  <div className="text-right"><div className="text-xs sm:text-sm opacity-75">Marking: +{stats?.marking?.positive ?? 4}{stats?.marking?.negative ? ` | ${stats.marking.negative}` : ''}</div></div>
                </div>
                <div className="text-center mb-3 sm:mb-4">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold mb-1 sm:mb-2">{stats?.earnedMarks} / {stats?.totalMarks}</div>
                  <div className="text-base sm:text-lg opacity-90">Score: {stats?.scorePercentage}%</div>
                  <div className="text-xs sm:text-sm opacity-75 mt-1">Accuracy: {testResult.percentage}%</div>
                </div>
                <div className="text-center">
                  <div className="inline-block px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium bg-white/20">{performance.label}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-green-200 bg-green-50/50 hover:shadow-lg transition-all">
              <CardContent className="p-3 sm:p-4 md:p-6 text-center">
                <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 mx-auto mb-2 sm:mb-3 text-green-600" />
                <div className="text-xl sm:text-2xl font-bold mb-0.5 sm:mb-1 text-green-700">{stats?.correctAnswers}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Correct</div>
                <div className="text-xs text-green-700 font-medium">+{(stats?.correctAnswers || 0) * (stats?.marking?.positive ?? 4)} marks</div>
              </CardContent>
            </Card>

            <Card className="border-2 border-red-200 bg-red-50/50 hover:shadow-lg transition-all">
              <CardContent className="p-3 sm:p-4 md:p-6 text-center">
                <XCircle className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 mx-auto mb-2 sm:mb-3 text-red-600" />
                <div className="text-xl sm:text-2xl font-bold mb-0.5 sm:mb-1 text-red-700">{stats?.incorrectAnswers}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Incorrect</div>
                <div className="text-xs text-red-700 font-medium">{(stats?.incorrectAnswers || 0) * -1} marks</div>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 bg-blue-50/50 hover:shadow-lg transition-all">
              <CardContent className="p-3 sm:p-4 md:p-6 text-center">
                <Clock className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 mx-auto mb-2 sm:mb-3 text-blue-600" />
                <div className="text-xl sm:text-2xl font-bold mb-0.5 sm:mb-1 text-blue-700">{formatTime(testResult.timeSpent)}</div>
                <div className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">Time Taken</div>
                <div className="text-xs text-muted-foreground">{stats?.avgTimePerQuestion}s/Q</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Performance Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><BarChart3 className="w-5 h-5 mr-2" />Performance Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Score Performance</span>
                      <span className="text-sm font-bold text-primary">{stats?.scorePercentage}%</span>
                    </div>
                    <Progress value={Math.max(0, parseFloat(stats?.scorePercentage || "0"))} className="h-3" />
                    <p className="text-xs text-muted-foreground mt-1">{stats?.earnedMarks} marks earned out of {stats?.totalMarks} total marks</p>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Accuracy Rate</span>
                      <span className="text-sm font-bold text-green-600">{stats?.accuracy}%</span>
                    </div>
                    <Progress value={parseFloat(stats?.accuracy || "0")} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{testResult.correctAnswers} correct out of {testResult.answeredQuestions} attempted</p>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Attempt Rate</span>
                      <span className="text-sm font-bold text-blue-600">{stats?.attemptRate}%</span>
                    </div>
                    <Progress value={parseFloat(stats?.attemptRate || "0")} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{testResult.answeredQuestions} attempted out of {testResult.totalQuestions} total</p>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Speed Analysis</span>
                      <span className="text-sm font-bold text-purple-600">{stats?.avgTimePerQuestion}s/question</span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${Math.min(((stats?.avgTimePerQuestion || 0) / 120) * 100, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Optimal time: 60-90s per question</p>
                  </div>
                </CardContent>
              </Card>

              {/* Question Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center"><BookOpen className="w-5 h-5 mr-2" />Question Analysis</div>
                    <Button variant="outline" size="sm" onClick={() => setShowDetailedAnalysis(!showDetailedAnalysis)}>
                      <Eye className="w-4 h-4 mr-1" />{showDetailedAnalysis ? "Hide Details" : "View Details"}
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {showDetailedAnalysis ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {testResult.results.map((result, index) => (
                        <div key={result.questionId} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">Question {index + 1}</span>
                            <div className="flex items-center space-x-2">
                              {result.isCorrect ? (
                                <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />+4 marks</Badge>
                              ) : result.selectedOption ? (
                                <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />-1 mark</Badge>
                              ) : (
                                <Badge variant="secondary">0 marks</Badge>
                              )}
                              {result.isMarkedForReview && <Badge variant="outline">Marked</Badge>}
                            </div>
                          </div>
                          {(() => {
                            const question = testResult.questions?.find(q => q.id === result.questionId);
                            const qType = question?.question_type || 'single_correct';
                            const isNumerical = qType === 'numerical_int' || qType === 'numerical_decimal';
                            const isMulti = qType === 'multi_correct';

                            const correctSet = new Set<string>(
                              (question?.correct_options && question.correct_options.length > 0
                                ? question.correct_options
                                : (question?.correct_option ? [question.correct_option] : []))
                              .map(s => s.toUpperCase())
                            );
                            const selectedSet = new Set<string>(
                              isNumericalSel(result.selectedOption)
                                ? []
                                : (result.selectedOption || '').split(',').map(s => s.trim()).filter(Boolean)
                            );
                            const userDisplay = isNumericalSel(result.selectedOption)
                              ? result.selectedOption.slice(4)
                              : (result.selectedOption || 'Not Attempted');
                            const correctDisplay = isNumerical
                              ? (question?.numerical_answer != null ? String(question.numerical_answer) : result.correctOption)
                              : (result.correctOption || Array.from(correctSet).join(','));

                            const options = question ? [
                              ['A', question.option_a],
                              ['B', question.option_b],
                              ['C', question.option_c],
                              ['D', question.option_d],
                            ] as const : [];

                            return (
                              <>
                                <div className="text-sm leading-relaxed mb-3 text-foreground">
                                  <MathDisplay text={question?.question_text || question?.question || `Question ${index + 1}`} />
                                </div>

                                {question?.question_image_url && (
                                  <div className="mb-3 flex justify-center">
                                    <img
                                      src={question.question_image_url}
                                      alt="Question diagram"
                                      loading="lazy"
                                      className="max-h-64 rounded-lg border border-border object-contain bg-background"
                                    />
                                  </div>
                                )}

                                {isNumerical ? (
                                  <div className="grid sm:grid-cols-2 gap-2 mb-3">
                                    <div className="rounded-lg border border-border p-3 bg-background">
                                      <p className="text-[10px] uppercase text-muted-foreground mb-1">Your Answer</p>
                                      <p className="text-sm font-medium">{userDisplay}</p>
                                    </div>
                                    <div className="rounded-lg border border-green-400 bg-green-50 p-3">
                                      <p className="text-[10px] uppercase text-green-700 mb-1">Correct Answer</p>
                                      <p className="text-sm font-medium text-green-700">{correctDisplay}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid gap-2 mb-3">
                                    {options.filter(([, v]) => !!v).map(([optionKey, optionValue]) => {
                                      const isSelected = selectedSet.has(optionKey);
                                      const isCorrect = correctSet.has(optionKey);
                                      return (
                                        <div
                                          key={optionKey}
                                          className={`rounded-lg border p-3 ${isCorrect ? 'border-green-400 bg-green-50' : isSelected ? 'border-blue-400 bg-blue-50' : 'border-border bg-background'}`}
                                        >
                                          <div className="flex items-start gap-2">
                                            <Badge variant="outline" className={`text-[10px] ${isCorrect ? 'border-green-500 text-green-700' : isSelected ? 'border-blue-500 text-blue-700' : ''}`}>
                                              {optionKey}
                                            </Badge>
                                            <div className="text-sm flex-1">
                                              <MathDisplay text={optionValue || ''} />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="grid grid-cols-3 gap-4 text-sm">
                                  <div><span className="text-muted-foreground">Your Answer: </span><span className="font-medium">{userDisplay}</span></div>
                                  <div><span className="text-muted-foreground">Correct Answer: </span><span className="font-medium text-green-600">{correctDisplay}</span></div>
                                  <div><span className="text-muted-foreground">Time: </span><span className="font-medium">{result.timeSpent}s</span></div>
                                </div>

                                {question?.explanation && (
                                  <div className="mt-3 rounded-lg bg-muted/40 border border-border p-3 text-sm">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Explanation</p>
                                    <MathDisplay text={question.explanation} />
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">Click "View Details" to see question-wise breakdown with answers and time analysis</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card className="border-2 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center text-lg"><Target className="w-5 h-5 mr-2 text-primary" />Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button className="w-full bg-linear-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 shadow-md" onClick={() => navigate("/tests")}>
                    <RefreshCw className="w-4 h-4 mr-2" />Take Another Test
                  </Button>
                  {shareCardEnabled && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Share Results</p>
                      <Button
                        className="w-full bg-linear-to-r from-orange-500 to-pink-500 text-white hover:from-orange-600 hover:to-pink-600"
                        onClick={() => {
                          if (!testResult || !user) return;
                          const s = calculateStats();
                          const referralUrl = ReferralService.getReferralLink(user.id);
                          setShareCardOpts({
                            type: 'test',
                            title: testResult.testTitle,
                            scorePercent: Math.round(parseFloat(s?.scorePercentage || '0')),
                            correct: s?.correctAnswers || 0,
                            total: testResult.totalQuestions,
                            accuracy: Math.round(parseFloat(s?.accuracy || '0')),
                            timeMin: Math.round((testResult.timeSpent || 0) / 60),
                            referralUrl,
                          });
                          setShareCardOpen(true);
                        }}
                      >
                        <ImageIcon className="w-4 h-4 mr-2" />Generate Share Card 🎨
                      </Button>
                      <Button variant="outline" className="w-full border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={handleWhatsAppShare}>
                        <MessageCircle className="w-4 h-4 mr-2" />Share on WhatsApp
                      </Button>
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Downloads</p>
                    <Button variant="outline" className="w-full" onClick={generateQuestionPaperPDF}>
                      <FileText className="w-4 h-4 mr-2" />Question Paper (PDF)
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Continue Learning</p>
                    <Button variant="outline" className="w-full border-purple-500 text-purple-600 hover:bg-purple-50 hover:text-purple-700" onClick={() => navigate("/study-now")}>
                      <BookOpen className="w-4 h-4 mr-2" />Study Weak Areas
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><TrendingUp className="w-5 h-5 mr-2" />Next Steps</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {["Review incorrect answers and understand concepts", "Focus on accuracy to avoid negative marking", "Practice similar questions to strengthen weak areas", "Take regular mock tests to track progress"].map((tip, i) => (
                    <div key={i} className="flex items-start space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0"></div>
                      <span>{tip}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <ShareCardDialog
        open={shareCardOpen}
        onOpenChange={setShareCardOpen}
        opts={shareCardOpts}
        filename={`jeenie-${testResult?.testTitle?.replace(/\s+/g, '-').toLowerCase() || 'test'}.png`}
      />
    </div>
  );
};

export default TestResultsPage;

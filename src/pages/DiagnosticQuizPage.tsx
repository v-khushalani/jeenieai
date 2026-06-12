import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle, Loader2, Brain } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MathDisplay } from '@/components/admin/MathDisplay';
import { logger } from '@/utils/logger';
import LoadingScreen from '@/components/ui/LoadingScreen';
import 'katex/dist/katex.min.css';

import safeLocalStorage from '@/utils/safeStorage';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
interface Question {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  difficulty?: string;
  topic?: string;
  topic_id?: string;
  chapter?: string;
  subject?: string;
}

const OPTIONS = ['A', 'B', 'C', 'D'] as const;
const TOTAL_QUESTIONS = 10;

const DiagnosticQuizPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const getScopedKey = useCallback((base: string) => (user?.id ? `${base}:${user.id}` : base), [user?.id]);

  const markDiagnosticComplete = useCallback(() => {
    safeLocalStorage.setItem(getScopedKey('diagnosticComplete'), 'true');
    safeLocalStorage.setItem('diagnosticComplete', 'true');
  }, [getScopedKey]);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [answerResult, setAnswerResult] = useState<{
    isCorrect: boolean;
    correctOption: string;
  } | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const fetchQuestions = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Get user's target exam
      const { data: profile } = await supabase
        .from('profiles')
        .select('target_exam')
        .eq('id', user.id)
        .single();

      const targetExam = profile?.target_exam || 'JEE';

      // Fetch a mix of questions across subjects
      const { data, error } = await supabase
        .from('questions_public')
        .select('id, question, option_a, option_b, option_c, option_d, difficulty, topic, topic_id, chapter, subject')
        .eq('is_active', true)
        .eq('exam', targetExam)
        .eq('question_type', 'single_correct')
        .limit(100);

      if (error) throw error;

      // Shuffle and pick 10 diverse questions (spread across subjects)
      const bySubject: Record<string, Question[]> = {};
      (data || []).forEach(q => {
        const s = formatSubjectDisplay(q.subject, q.chapter);
        if (!bySubject[s]) bySubject[s] = [];
        bySubject[s].push(q);
      });

      const selected: Question[] = [];
      const subjects = Object.keys(bySubject);
      let idx = 0;
      while (selected.length < TOTAL_QUESTIONS && idx < 100) {
        const subj = subjects[idx % subjects.length];
        const pool = bySubject[subj];
        if (pool && pool.length > 0) {
          const rand = Math.floor(Math.random() * pool.length);
          const q = pool.splice(rand, 1)[0];
          if (!selected.find(s => s.id === q.id)) {
            selected.push(q);
          }
        }
        idx++;
      }

      setQuestions(selected);
    } catch (error) {
      logger.error('Failed to fetch diagnostic questions:', error);
      toast.error('Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    // Check if already completed
      const completed = safeLocalStorage.getItem(getScopedKey('diagnosticComplete')) || safeLocalStorage.getItem('diagnosticComplete');
    if (completed) {
      navigate('/dashboard', { replace: true });
      return;
    }
    fetchQuestions();
  }, [fetchQuestions, getScopedKey, navigate]);

  const handleOptionSelect = async (option: string) => {
    if (selectedOption || !user || isValidating) return;
    setSelectedOption(option);
    setIsValidating(true);

    try {
      const currentQuestion = questions[currentIndex];
      const { data: rpcData } = await supabase.rpc('validate_question_answer', {
        p_question_id: currentQuestion.id,
        p_selected_options: [option],
        p_numerical_answer: null,
      });

      const result = rpcData as { is_correct: boolean; correct_option?: string; correct_options?: string[] } | null;

      if (result) {
        const correctOption = (result.correct_options && result.correct_options[0]) || result.correct_option || '';
        setAnswerResult({
          isCorrect: result.is_correct,
          correctOption,
        });

        setStats(prev => ({
          correct: prev.correct + (result.is_correct ? 1 : 0),
          total: prev.total + 1,
        }));

        // Seed topic mastery
        if (currentQuestion.topic_id) {
          const masteryCall = async () => {
            try {
              await supabase.rpc('upsert_topic_mastery', {
                p_user_id: user.id,
                p_topic_id: currentQuestion.topic_id!,
                p_is_correct: result.is_correct,
              });
            } catch (e) { logger.error('Topic mastery error:', e); }
          };
          masteryCall();
        }

        // Auto-advance after 1.5s
        setTimeout(() => {
          if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setSelectedOption(null);
            setAnswerResult(null);
          } else {
            // Quiz complete
            markDiagnosticComplete();
            toast.success(`Diagnostic complete! ${stats.correct + (result.is_correct ? 1 : 0)}/${TOTAL_QUESTIONS} correct`);
            navigate('/dashboard', { replace: true });
          }
        }, 1500);
      }
    } catch (error) {
      logger.error('Error validating answer:', error);
      toast.error('Failed to check answer');
    } finally {
      setIsValidating(false);
    }
  };

  const getCircleStyle = (option: string) => {
    if (!selectedOption) return 'border-muted-foreground/40';
    if (!answerResult) return option === selectedOption ? 'border-primary bg-primary/20 text-primary' : 'border-muted-foreground/40';
    const normalized = answerResult.correctOption?.toUpperCase().replace('OPTION_', '') || '';
    if (option === normalized) return 'border-green-500 bg-green-500 text-white';
    if (option === selectedOption && !answerResult.isCorrect) return 'border-red-500 bg-red-500 text-white';
    return 'border-muted-foreground/40';
  };

  if (loading) {
    return <LoadingScreen pageName="Diagnostic Quiz" message="Preparing your diagnostic quiz..." />;
  }

  if (questions.length === 0) {
    // Skip if no questions available
    markDiagnosticComplete();
    navigate('/dashboard', { replace: true });
    return null;
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-4">
        <div className="container mx-auto max-w-2xl text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Diagnostic Quiz</h1>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Quick assessment to personalize your learning path
          </p>
          <div className="flex items-center gap-3">
            <Progress value={progress} className="h-2 flex-1" />
            <span className="text-xs font-medium text-muted-foreground">
              {currentIndex + 1}/{questions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto container mx-auto max-w-2xl px-4 py-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            {currentQuestion.subject && (
              <Badge variant="outline" className="text-[10px] mb-3">
                {currentQuestion.subject}
              </Badge>
            )}
            <div className="text-sm sm:text-base leading-relaxed mb-6">
              <MathDisplay text={currentQuestion.question} />
            </div>

            <div className="space-y-3">
              {OPTIONS.map(option => {
                const optionText = currentQuestion[`option_${option.toLowerCase()}` as keyof Question] as string;
                return (
                  <button
                    key={option}
                    onClick={() => handleOptionSelect(option)}
                    disabled={!!selectedOption}
                    className={`w-full p-3 sm:p-4 text-left rounded-xl border-2 transition-all duration-300 ${
                      !selectedOption
                        ? 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
                        : !answerResult
                        ? option === selectedOption ? 'border-primary/50 bg-primary/10 animate-pulse' : 'border-border opacity-50'
                        : option === answerResult.correctOption?.toUpperCase().replace('OPTION_', '')
                        ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                        : option === selectedOption && !answerResult.isCorrect
                        ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                        : 'border-border opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 transition-all ${getCircleStyle(option)}`}>
                        {option}
                      </div>
                      <span className="text-sm sm:text-base flex-1">
                        <MathDisplay text={optionText} />
                      </span>
                      {answerResult && option === answerResult.correctOption?.toUpperCase().replace('OPTION_', '') && (
                        <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                      )}
                      {answerResult && option === selectedOption && !answerResult.isCorrect && (
                        <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {answerResult && (
              <div className="mt-4 text-center">
                <p className={`text-sm font-medium ${answerResult.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                  {answerResult.isCorrect ? 'Correct!' : 'Incorrect'} — Moving to next...
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Skip button */}
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              markDiagnosticComplete();
              navigate('/dashboard', { replace: true });
            }}
          >
            Skip diagnostic →
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticQuizPage;

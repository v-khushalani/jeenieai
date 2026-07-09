/**
 * ClassRecapTest — 10-question recap of a logged class.
 * Minimal, one-question-at-a-time UI. Ends with "kya stuck, kya slipped" summary.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Loader2, ArrowRight, Sparkles, BookOpen, Home } from 'lucide-react';

interface Q {
  id: string;
  question_text: string;
  option_a?: string; option_b?: string; option_c?: string; option_d?: string;
  correct_option?: string;
  correct_answer?: string;
  explanation?: string;
  difficulty?: string;
}
interface ClassLog {
  id: string; subject: string; chapter_id: string | null; chapter_name: string | null;
}

const RECAP_SIZE = 10;

export default function ClassRecapTest() {
  const { classLogId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [log, setLog] = useState<ClassLog | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Array<{ q: Q; picked: string | null; correct: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !classLogId) return;
    setLoading(true);
    try {
      const { data: cl, error: clErr } = await supabase
        .from('class_logs').select('id, subject, chapter_id, chapter_name')
        .eq('id', classLogId).eq('user_id', user.id).maybeSingle();
      if (clErr || !cl) throw clErr ?? new Error('Class log nahi mili');
      setLog(cl);

      let qb = supabase
        .from('questions')
        .select('id, question_text, option_a, option_b, option_c, option_d, correct_option, correct_answer, explanation, difficulty')
        .eq('is_active', true)
        .limit(60);

      if (cl.chapter_id) qb = qb.eq('chapter_id', cl.chapter_id);
      else if (cl.chapter_name) qb = qb.ilike('chapter', `%${cl.chapter_name}%`);
      else qb = qb.ilike('subject', cl.subject);

      const { data: qs, error: qErr } = await qb;
      if (qErr) throw qErr;

      const valid = (qs ?? []).filter(q => q.question_text && (q.option_a || q.correct_answer));
      const shuffled = valid.sort(() => Math.random() - 0.5).slice(0, RECAP_SIZE);
      if (shuffled.length === 0) {
        toast.error('Is chapter ke questions abhi nahi hain — dusra chapter try karo');
      }
      setQuestions(shuffled);
    } catch (e: any) {
      toast.error(e?.message ?? 'Recap load nahi hua');
    } finally {
      setLoading(false);
    }
  }, [user?.id, classLogId]);

  useEffect(() => { void load(); }, [load]);

  const current = questions[idx];
  const opts = useMemo(() => current ? ([
    ['A', current.option_a], ['B', current.option_b], ['C', current.option_c], ['D', current.option_d],
  ] as const).filter(([, v]) => !!v) : [], [current]);

  const submit = async () => {
    if (!current || !picked) return;
    const correct = picked.toUpperCase() === (current.correct_option ?? '').toUpperCase();
    setRevealed(true);
    setAnswers((prev) => [...prev, { q: current, picked, correct }]);
    if (user?.id) {
      supabase.from('question_attempts').insert({
        user_id: user.id, question_id: current.id, is_correct: correct,
        selected_option: picked, time_taken_seconds: 0,
      }).then(() => {});
    }
  };

  const next = async () => {
    setPicked(null); setRevealed(false);
    if (idx + 1 >= questions.length) {
      await finish();
    } else {
      setIdx(idx + 1);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      // regenerate mission so this counts as done next time
      await supabase.functions.invoke('generate-daily-mission', { body: { force: true } }).catch(() => {});
    } finally {
      setSaving(false);
      setDone(true);
    }
  };

  const correctCount = answers.filter(a => a.correct).length;
  const totalAnswered = answers.length;
  const pct = totalAnswered ? Math.round((correctCount / totalAnswered) * 100) : 0;

  if (loading) {
    return (
      <div className="mobile-app-shell bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Recap taiyaar kar raha hu…
        </div>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="mobile-app-shell bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
          <BookOpen className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-xs">
            Is chapter ({log?.chapter_name ?? log?.subject}) ke recap questions abhi ready nahi hain.
          </p>
          <Button onClick={() => navigate('/dashboard')}><Home className="w-4 h-4 mr-2" />Home</Button>
        </div>
      </div>
    );
  }

  if (done) {
    const stuck = answers.filter(a => a.correct).length;
    const slipped = answers.length - stuck;
    return (
      <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 max-w-xl space-y-5">
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-primary/80">
                <Sparkles className="w-3 h-3" /> Class Recap
              </div>
              <h1 className="text-2xl font-bold">{log?.chapter_name ?? log?.subject}</h1>
              <p className="text-sm text-muted-foreground">Tera aaj ka retention score</p>
            </div>

            <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
              <CardContent className="p-6 text-center space-y-2">
                <div className="text-5xl font-bold tabular-nums">{pct}%</div>
                <p className="text-xs text-muted-foreground">{stuck}/{answers.length} correct</p>
                <p className="text-sm mt-3">
                  {pct >= 80 ? 'Class solid stuck — kal revision ke liye set kar dete hain.'
                    : pct >= 50 ? 'Half samajh aaya. Kal targeted practice milegi.'
                    : 'Concept revise karna zaroori hai — kal isse pehle chapter recap.'}
                </p>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Question breakdown</p>
              {answers.map((a, i) => (
                <div key={i} className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${a.correct ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'}`}>
                  {a.correct ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                  <span className="line-clamp-2">Q{i + 1}: {a.q.question_text}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" onClick={() => navigate(`/practice?mode=chapter&subject=${encodeURIComponent(log?.subject ?? '')}${log?.chapter_id ? `&chapter=${log.chapter_id}` : ''}`)}>
                More practice
              </Button>
              <Button onClick={() => navigate('/dashboard')}><Home className="w-4 h-4 mr-2" />Back to mission</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-4 max-w-xl space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                  Class Recap
                </Badge>
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {log?.chapter_name ?? log?.subject}
                </span>
              </div>
              <span className="text-xs font-semibold tabular-nums">{idx + 1}/{questions.length}</span>
            </div>
            <Progress value={((idx + (revealed ? 1 : 0)) / questions.length) * 100} className="h-1.5" />
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{current.question_text}</p>

              <div className="space-y-2">
                {opts.map(([letter, text]) => {
                  const isPicked = picked === letter;
                  const isCorrect = revealed && letter === (current.correct_option ?? '').toUpperCase();
                  const isWrong = revealed && isPicked && !isCorrect;
                  return (
                    <button
                      key={letter}
                      onClick={() => !revealed && setPicked(letter)}
                      disabled={revealed}
                      className={`w-full text-left p-2.5 rounded-lg border text-sm transition flex items-start gap-2.5
                        ${isCorrect ? 'border-emerald-500 bg-emerald-500/10' :
                          isWrong ? 'border-rose-500 bg-rose-500/10' :
                          isPicked ? 'border-primary bg-primary/5' :
                          'border-border hover:border-primary/40'}`}
                    >
                      <span className="text-[11px] font-bold w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">{letter}</span>
                      <span className="flex-1">{text}</span>
                      {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                      {isWrong && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {revealed && current.explanation && (
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Explanation</p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{current.explanation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {!revealed ? (
            <Button className="w-full h-11" disabled={!picked} onClick={submit}>Submit</Button>
          ) : (
            <Button className="w-full h-11" onClick={next} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
              {idx + 1 >= questions.length ? 'Finish recap' : 'Next question'}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

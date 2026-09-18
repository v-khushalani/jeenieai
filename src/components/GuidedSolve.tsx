import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MathDisplay } from '@/components/admin/MathDisplay';
import { MASCOT } from '@/config/brand';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';
import 'katex/dist/katex.min.css';

export interface WalkthroughStep {
  ask: string;
  options: { text: string; correct: boolean }[];
  hint?: string;
  result: string;
}

interface GuidedSolveProps {
  questionId: string;
  /** Optional pre-loaded steps — used by the public landing demo. */
  preloaded?: { steps: WalkthroughStep[]; final?: string };
  onClose?: () => void;
  className?: string;
  autoStart?: boolean;
}

/**
 * Guided Solve — the student derives the answer instead of reading it.
 * JEEnie asks one decision at a time, the working builds line by line.
 */
const GuidedSolve = ({
  questionId,
  preloaded,
  onClose,
  className,
  autoStart = true,
}: GuidedSolveProps) => {
  const [steps, setSteps] = useState<WalkthroughStep[]>(preloaded?.steps ?? []);
  const [final, setFinal] = useState(preloaded?.final ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [working, setWorking] = useState<string[]>([]);
  const [wrongPick, setWrongPick] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (preloaded) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-walkthrough', {
        body: { questionId },
      });
      if (fnError) throw fnError;
      if (!data?.steps?.length) throw new Error(data?.error || 'empty');
      setSteps(data.steps as WalkthroughStep[]);
      setFinal(typeof data.final === 'string' ? data.final : '');
      setIndex(0);
      setWorking([]);
      setDone(false);
    } catch (err) {
      logger.error('GuidedSolve load failed', err);
      setError('Abhi samjha nahi paaya. Ek baar aur try kar.');
    } finally {
      setLoading(false);
    }
  }, [preloaded, questionId]);

  useEffect(() => {
    if (autoStart && !preloaded && steps.length === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, questionId]);

  const current = steps[index];

  const pick = (optionIndex: number) => {
    if (!current || done) return;
    const option = current.options[optionIndex];
    if (!option.correct) {
      setWrongPick(optionIndex);
      window.setTimeout(() => setWrongPick(null), 1800);
      return;
    }
    setWrongPick(null);
    if (current.result) setWorking((w) => [...w, current.result]);
    if (index + 1 >= steps.length) setDone(true);
    else setIndex(index + 1);
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-primary/25 bg-card/80 backdrop-blur-sm overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 border-b border-primary/15">
        <img src={MASCOT.think} alt="" className="h-5 w-5 object-contain" />
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          Samjha de
        </span>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {steps.length > 0 && !done ? `Step ${index + 1}/${steps.length}` : done ? 'Ho gaya' : ''}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close guided solve"
            className="ml-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Soch raha hoon, ek second…
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={load}>
              Phir se try kar
            </Button>
          </div>
        )}

        {/* Working builds up as they answer */}
        {working.length > 0 && (
          <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Working
            </p>
            {working.map((line, i) => (
              <motion.div
                key={`${i}-${line}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2 text-sm"
              >
                <Check className="h-3.5 w-3.5 text-emerald-500 mt-1 shrink-0" />
                <MathDisplay text={line} />
              </motion.div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {current && !done && !loading && !error && (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-3"
            >
              <p className="text-sm font-medium leading-relaxed">
                <MathDisplay text={current.ask} />
              </p>
              <div className="grid gap-2">
                {current.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => pick(i)}
                    className={cn(
                      'text-left rounded-xl border px-3.5 py-3 text-sm transition-all',
                      'hover:border-primary/60 hover:bg-primary/5 active:scale-[0.99]',
                      wrongPick === i
                        ? 'border-destructive/70 bg-destructive/10'
                        : 'border-border bg-background/60',
                    )}
                  >
                    <MathDisplay text={option.text} />
                  </button>
                ))}
              </div>
              {wrongPick !== null && current.hint && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-amber-600 dark:text-amber-400"
                >
                  {current.hint}
                </motion.p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-1.5"
          >
            <Sparkles className="h-5 w-5 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold">Tune khud solve kiya</p>
            {final && (
              <p className="text-base font-bold">
                <MathDisplay text={final} />
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Har step tera answer tha — padha hua solution nahi.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default GuidedSolve;

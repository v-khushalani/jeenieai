import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { MathDisplay } from '@/components/admin/MathDisplay';
import { detectTextGlitches } from '@/utils/mathRenderer';
import { cn } from '@/lib/utils';

export interface PreviewQuestion {
  question: string;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  correct_option?: string | null;
  explanation?: string | null;
}

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

/**
 * Shared "student view" preview used by the CSV uploader and the review queue
 * editor so admins always see exactly what the student will see.
 */
export function QuestionLivePreview({
  question,
  className,
  compact = false,
}: {
  question: PreviewQuestion;
  className?: string;
  compact?: boolean;
}) {
  const glitchSources = [
    question.question,
    question.option_a,
    question.option_b,
    question.option_c,
    question.option_d,
    question.explanation,
  ].filter(Boolean) as string[];

  const glitches = Array.from(new Set(glitchSources.flatMap(detectTextGlitches)));
  const correct = (question.correct_option || '').trim().toUpperCase();

  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Student view (live)
        </span>
        {glitches.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end">
            {glitches.map((g) => (
              <Badge key={g} variant="destructive" className="text-[10px] gap-1">
                <AlertTriangle className="h-3 w-3" /> {g}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className={cn('font-medium whitespace-pre-wrap', compact && 'text-sm')}>
        <MathDisplay text={question.question || ''} block />
      </div>

      <div className="space-y-1.5">
        {OPTION_KEYS.map((key) => {
          const value = (question as unknown as Record<string, string | undefined>)[`option_${key}`];
          if (!value) return null;
          const isCorrect = correct === key.toUpperCase();
          return (
            <div
              key={key}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2 text-sm',
                isCorrect && 'border-primary bg-primary/10'
              )}
            >
              <span className="font-semibold">{key.toUpperCase()}.</span>
              <span className="flex-1">
                <MathDisplay text={value} />
              </span>
            </div>
          );
        })}
      </div>

      {question.explanation ? (
        <div className="rounded-md bg-muted p-2 text-sm">
          <span className="font-semibold">Explanation: </span>
          <MathDisplay text={question.explanation} />
        </div>
      ) : null}
    </div>
  );
}

export default QuestionLivePreview;

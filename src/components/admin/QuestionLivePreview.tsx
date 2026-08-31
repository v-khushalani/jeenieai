import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { MathDisplay } from '@/components/admin/MathDisplay';
import { detectTextGlitches } from '@/utils/mathRenderer';
import { cn } from '@/lib/utils';

export interface PreviewQuestion {
  question: string;
  question_image_url?: string | null;
  option_a?: string | null;
  option_a_image_url?: string | null;
  option_b?: string | null;
  option_b_image_url?: string | null;
  option_c?: string | null;
  option_c_image_url?: string | null;
  option_d?: string | null;
  option_d_image_url?: string | null;
  correct_option?: string | null;
  explanation?: string | null;
  explanation_image_url?: string | null;
}

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

/**
 * Shared "student view" preview used by the CSV uploader and the review queue
 * editor so admins always see exactly what the student will see — including diagrams.
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
  const record = question as unknown as Record<string, string | undefined | null>;

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

      {question.question_image_url && (
        <img
          src={question.question_image_url}
          alt="Question diagram"
          loading="lazy"
          className="max-h-64 rounded-md border bg-background object-contain"
        />
      )}

      <div className="space-y-1.5">
        {OPTION_KEYS.map((key) => {
          const value = record[`option_${key}`];
          const img = record[`option_${key}_image_url`];
          if (!value && !img) return null;
          const isCorrect = correct === key.toUpperCase() || correct.split(',').includes(key.toUpperCase());
          return (
            <div
              key={key}
              className={cn(
                'flex items-start gap-2 rounded-md border p-2 text-sm',
                isCorrect && 'border-primary bg-primary/10'
              )}
            >
              <span className="font-semibold">{key.toUpperCase()}.</span>
              <span className="flex-1 space-y-1.5">
                {value ? <MathDisplay text={value} /> : null}
                {img ? (
                  <img
                    src={img}
                    alt={`Option ${key.toUpperCase()} diagram`}
                    loading="lazy"
                    className="max-h-40 rounded border bg-background object-contain"
                  />
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {(question.explanation || question.explanation_image_url) ? (
        <div className="rounded-md bg-muted p-2 text-sm space-y-2">
          <div>
            <span className="font-semibold">Explanation: </span>
            {question.explanation ? <MathDisplay text={question.explanation} /> : null}
          </div>
          {question.explanation_image_url && (
            <img
              src={question.explanation_image_url}
              alt="Explanation diagram"
              loading="lazy"
              className="max-h-52 rounded border bg-background object-contain"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export default QuestionLivePreview;

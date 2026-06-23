import React, { useState } from 'react';
import { AlertTriangle, Flag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface QuestionReportDialogProps {
  questionId: string;
  questionText?: string;
  onClose: () => void;
  onReported?: (questionId: string) => void;
}

// DB allowed values: wrong_chapter | incorrect_answer | unclear_question | duplicate | outdated | other
const REPORT_REASONS = [
  { value: 'incorrect_answer', label: 'Wrong answer marked', dbReason: 'incorrect_answer' as const, prefix: null },
  { value: 'wrong_options', label: 'Options are incorrect', dbReason: 'other' as const, prefix: 'Options are incorrect.' },
  { value: 'unclear_question', label: 'Question is unclear', dbReason: 'unclear_question' as const, prefix: null },
  { value: 'wrong_explanation', label: 'Explanation is wrong', dbReason: 'other' as const, prefix: 'Explanation is wrong.' },
  { value: 'missing_diagram', label: 'Missing diagram/image', dbReason: 'other' as const, prefix: 'Missing diagram/image.' },
  { value: 'wrong_chapter', label: 'Wrong chapter/topic', dbReason: 'wrong_chapter' as const, prefix: null },
  { value: 'duplicate', label: 'Duplicate question', dbReason: 'duplicate' as const, prefix: null },
  { value: 'outdated', label: 'Outdated content', dbReason: 'outdated' as const, prefix: null },
  { value: 'other', label: 'Other issue', dbReason: 'other' as const, prefix: null },
];

export const QuestionReportDialog: React.FC<QuestionReportDialogProps> = ({
  questionId,
  questionText,
  onClose,
  onReported,
}) => {
  const { user } = useAuth();
  const [selectedReason, setSelectedReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const firstReasonRef = React.useRef<HTMLButtonElement | null>(null);

  const handleSubmit = async () => {
    if (!selectedReason || !user?.id) return;
    setSubmitting(true);
    try {
      const reasonConfig = REPORT_REASONS.find((r) => r.value === selectedReason);
      const dbReason = reasonConfig?.dbReason ?? 'other';
      const normalizedDescription = [
        reasonConfig?.prefix ?? null,
        description.trim() || null,
      ].filter(Boolean).join(' ');

      const { error } = await supabase.from('question_reports').insert({
        question_id: questionId,
        user_id: user.id,
        reason: dbReason,
        status: 'pending',
        description: normalizedDescription || null,
      });
      if (error) throw error;
      toast.success('Report submitted! Skipping this question for everyone.');
      onReported?.(questionId);
      onClose();
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || 'Failed to submit report')
          : 'Failed to submit report';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  React.useEffect(() => {
    // Focus first reason for keyboard users when dialog opens
    setTimeout(() => {
      firstReasonRef.current?.focus();
    }, 0);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="bg-background rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden flex flex-col max-h-[85vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-destructive" />
            <h3 id="report-dialog-title" className="font-bold text-sm">Report Question</h3>
          </div>
          <button onClick={onClose} aria-label="Close report dialog" className="p-1 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {questionText && (
          <div className="px-4 pt-3">
            <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/50 rounded-lg p-2">
              {questionText.substring(0, 120)}...
            </p>
          </div>
        )}

        <div className="p-4 space-y-2 overflow-y-auto flex-1 min-h-0" role="radiogroup" aria-label="Report reason">
          <p className="text-xs font-medium text-muted-foreground mb-2">What's wrong?</p>
          {REPORT_REASONS.map((reason, idx) => (
            <button
              key={reason.value}
              ref={idx === 0 ? firstReasonRef : undefined}
              role="radio"
              aria-checked={selectedReason === reason.value}
              tabIndex={0}
              onClick={() => setSelectedReason(reason.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedReason(reason.value);
                }
              }}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border-2 transition-all focus:outline-hidden focus:ring-2 focus:ring-ring ${
                selectedReason === reason.value
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              {reason.label}
            </button>
          ))}
        </div>

        {selectedReason && (
          <div className="px-4 pb-2">
            <textarea
              aria-label="Additional details"
              placeholder="Add details (optional)..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-sm border-2 border-border rounded-xl p-3 bg-background resize-none h-16 focus:outline-hidden focus:border-primary"
              maxLength={500}
            />
          </div>
        )}

        <div className="p-4 pt-2 flex gap-2 border-t border-border bg-background shrink-0">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!selectedReason || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Small trigger button to use inline
export const ReportButton: React.FC<{ onClick: () => void; className?: string }> = ({ onClick, className }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ${className || ''}`}
    title="Report this question"
  >
    <AlertTriangle className="w-3.5 h-3.5" />
    <span className="hidden sm:inline">Report</span>
  </button>
);

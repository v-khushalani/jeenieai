import React from 'react';
import { cn } from '@/lib/utils';
import MascotBadge from './MascotBadge';
import { EMPTY_LINES, MascotMood } from '@/config/brand';

type Preset = keyof typeof EMPTY_LINES;

interface BrandEmptyStateProps {
  preset?: Preset;
  title?: string;
  body?: string;
  mood?: MascotMood;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/** Branded, on-voice empty state — mascot + Hinglish line instead of "No data". */
const BrandEmptyState: React.FC<BrandEmptyStateProps> = ({
  preset = 'generic',
  title,
  body,
  mood,
  action,
  className,
  compact = false,
}) => {
  const copy = EMPTY_LINES[preset];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-6 px-4' : 'gap-3 py-12 px-6',
        className
      )}
    >
      <MascotBadge mood={mood ?? copy.mood} size={compact ? 56 : 84} float />
      <h3 className={cn('font-bold text-foreground', compact ? 'text-base' : 'text-lg')}>
        {title ?? copy.title}
      </h3>
      <p className="max-w-xs text-sm text-muted-foreground">{body ?? copy.body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export default BrandEmptyState;

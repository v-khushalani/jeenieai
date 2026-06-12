import React from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface FilterPillsProps {
  options: string[];
  selected: string | string[];
  onSelect: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
  multiSelect?: boolean;
  wrap?: boolean;
}

export const FilterPills: React.FC<FilterPillsProps> = ({
  options, selected, onSelect, className, size = 'md', multiSelect = false, wrap = true,
}) => {
  const selectedItems = Array.isArray(selected) ? selected : [selected];

  return (
    <ScrollArea className={cn('w-full', className)}>
      <div className={cn('flex gap-2 pb-1', wrap ? 'flex-wrap' : 'flex-nowrap min-w-max')}>
        {options.map((opt) => {
          const isSelected = multiSelect ? selectedItems.includes(opt) : selected === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSelect(opt)}
              aria-pressed={isSelected}
              className={cn(
                'min-w-max whitespace-nowrap rounded-full border transition-all shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background font-medium',
                size === 'sm' ? 'px-2 py-1 text-xs sm:px-3 sm:py-1.5' : 'px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm md:px-4 md:py-2 md:text-base',
                isSelected
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

import React from 'react';
import { cn } from '@/lib/utils';
import { MASCOT, MascotMood, BRAND } from '@/config/brand';

interface MascotBadgeProps {
  mood?: MascotMood;
  size?: number;
  className?: string;
  glow?: boolean;
  float?: boolean;
}

/** Small circular JEEnie mascot avatar used across headers, empty states and loaders. */
const MascotBadge: React.FC<MascotBadgeProps> = ({
  mood = 'idle',
  size = 40,
  className,
  glow = false,
  float = false,
}) => (
  <span
    className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
    style={{ width: size, height: size }}
  >
    {glow && (
      <span className="absolute inset-0 rounded-full bg-primary/20 blur-lg animate-pulse" aria-hidden="true" />
    )}
    <img
      src={MASCOT[mood]}
      alt={`${BRAND.name} mascot`}
      width={size}
      height={size}
      loading="lazy"
      className={cn(
        'relative h-full w-full object-contain drop-shadow-sm',
        float && 'animate-float'
      )}
    />
  </span>
);

export default MascotBadge;

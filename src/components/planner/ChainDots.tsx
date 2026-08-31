/**
 * ChainDots — today's chain as dots. Done = filled, active = pulsing ring,
 * upcoming = hollow, last (mystery) step = "?".
 */
import { motion } from 'framer-motion';

interface Props {
  total: number;
  doneCount: number;
  activeIndex: number;
}

export default function ChainDots({ total, doneCount, activeIndex }: Props) {
  if (total <= 0) return null;
  return (
    <div className="flex items-center justify-center gap-2.5 py-1" data-testid="chain-dots">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < doneCount;
        const isActive = i === activeIndex;
        const isMystery = i === total - 1 && !isDone;
        return (
          <motion.div
            key={i}
            initial={false}
            animate={isDone ? { scale: [1.3, 1] } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            className={[
              'flex items-center justify-center rounded-full text-[9px] font-black transition-colors',
              isMystery ? 'w-5 h-5' : 'w-3 h-3',
              isDone
                ? 'bg-primary'
                : isActive
                  ? 'bg-primary/20 ring-2 ring-primary animate-pulse'
                  : 'bg-muted border border-border',
              isMystery && !isDone ? 'text-primary border-2 border-dashed border-primary/60 bg-primary/5' : '',
            ].join(' ')}
          >
            {isMystery && !isDone ? '?' : ''}
          </motion.div>
        );
      })}
    </div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Smile } from 'lucide-react';

/** Target progress that never shows overflow (30/25). Turns into a happy green "done" state. */
export default function GoalProgress({ got, target, label = 'questions' }: { got: number; target: number; label?: string }) {
  const done = got >= target;
  const bonus = Math.max(0, got - target);
  const pct = Math.min(100, (got / Math.max(1, target)) * 100);
  return (
    <AnimatePresence mode="wait" initial={false}>
      {done ? (
        <motion.div
          key="done"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className="flex items-center gap-2"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground">
            <Smile className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-bold text-success">Target done!</span>
          {bonus > 0 && <span className="text-[11px] font-semibold text-success/80">+{bonus} bonus</span>}
        </motion.div>
      ) : (
        <motion.div key="prog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-primary" initial={false} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">{target - got} {label} bache</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DoneTick() {
  return (
    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
      <Check className="h-4 w-4" strokeWidth={3} />
    </motion.span>
  );
}

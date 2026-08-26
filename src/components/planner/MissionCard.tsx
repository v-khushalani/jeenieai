/**
 * MissionCard — a single challenge in the daily chain.
 * Exactly one card is "active" at a time; the rest are done or locked.
 */
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Info, Lock, Play, Coins } from 'lucide-react';

export type BlockType = 'learn_practice' | 'revision' | 'weak_fix' | 'class_recap' | 'pyq' | 'mock';

export interface MissionBlock {
  id: string;
  type: BlockType;
  title: string;
  subtitle: string;
  subject?: string;
  chapter_id?: string;
  chapter_name?: string;
  topic_id?: string;
  minutes: number;
  question_count: number;
  passing_goal?: number;
  xp_reward?: number;
  why: string;
  what?: string;
  goal?: string;
  action_href: string;
  progress?: { attempted: number; correct: number; status: 'pending' | 'in_progress' | 'done'; seen_ids?: string[] };
}

export const TYPE_LABEL: Record<BlockType, string> = {
  learn_practice: 'Learn',
  revision: 'Revise',
  weak_fix: 'Weak-fix',
  class_recap: 'Recap',
  pyq: 'PYQ',
  mock: 'Mock',
};

const TYPE_ACCENT: Record<BlockType, string> = {
  learn_practice: 'text-blue-600 bg-blue-500/10',
  revision: 'text-amber-600 bg-amber-500/10',
  weak_fix: 'text-rose-600 bg-rose-500/10',
  class_recap: 'text-emerald-600 bg-emerald-500/10',
  pyq: 'text-violet-600 bg-violet-500/10',
  mock: 'text-orange-600 bg-orange-500/10',
};

interface Props {
  block: MissionBlock;
  state: 'done' | 'active' | 'locked';
  index: number;
  total: number;
  justDone?: boolean;
  onStart: () => void;
  onInfo: () => void;
}

export default function MissionCard({ block, state, index, total, justDone, onStart, onInfo }: Props) {
  const prog = block.progress ?? { attempted: 0, correct: 0, status: 'pending' as const };
  const target = block.question_count || 10;
  const pct = Math.min(100, Math.round((prog.attempted / Math.max(1, target)) * 100));
  const points = block.xp_reward ?? 0;

  if (state === 'locked') {
    return (
      <div data-testid="mission-card-locked" className="rounded-2xl border-2 border-border/50 bg-muted/30 px-4 py-3 flex items-center gap-3 select-none">
        <Lock className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <p className="flex-1 min-w-0 text-xs font-bold text-muted-foreground/70 blur-[2px] truncate">
          {block.title}
        </p>
        <span className="text-[10px] font-black uppercase text-muted-foreground/60 shrink-0">
          Step {index + 1}
        </span>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <motion.div
        initial={justDone ? { scale: 0.96 } : false}
        animate={{ scale: 1 }}
        data-testid="mission-card-done"
        className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 px-4 py-3 flex items-center gap-3"
      >
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" strokeWidth={3} />
        <p className="flex-1 min-w-0 text-xs font-bold line-through text-muted-foreground truncate">
          {block.title}
        </p>
        {points > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black text-amber-600">
            <Coins className="w-3 h-3" /> +{points}
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
      data-testid="mission-card-active"
      className="relative rounded-3xl border-2 border-primary/50 bg-card p-4 shadow-lg overflow-hidden"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/70 via-primary to-primary/40" />

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${TYPE_ACCENT[block.type]}`}>
          {TYPE_LABEL[block.type]}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Challenge {index + 1}/{total}
        </span>
      </div>

      <h3 className="mt-2 text-base font-black leading-tight tracking-tight">{block.title}</h3>
      <p className="mt-1 text-[11px] font-semibold text-muted-foreground leading-snug line-clamp-2">
        {block.what || block.subtitle}
      </p>

      <div className="mt-3 flex items-center gap-2 text-[10px] font-bold">
        <span className="tabular-nums px-2 py-1 rounded-lg bg-muted">{prog.attempted}/{target} Q</span>
        <span className="px-2 py-1 rounded-lg bg-muted">{block.minutes}m</span>
        {points > 0 && (
          <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 inline-flex items-center gap-1">
            <Coins className="w-3 h-3" /> +{points} Points
          </span>
        )}
      </div>

      {prog.attempted > 0 && <Progress value={pct} className="h-1.5 mt-3" />}

      <div className="mt-4 flex items-center gap-2">
        <Button data-testid="mission-start" className="flex-1 h-11 rounded-2xl font-black uppercase tracking-tight" onClick={onStart}>
          <Play className="w-4 h-4 mr-1.5" />
          {prog.attempted > 0 ? 'Continue challenge' : 'Challenge accept'}
        </Button>
        <Button variant="outline" size="icon" data-testid="mission-info" className="h-11 w-11 rounded-2xl" onClick={onInfo} aria-label="Details">
          <Info className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}

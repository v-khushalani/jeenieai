/**
 * BentoBoard — Planner 4.0 "Aaj" surface.
 * A game board, not a document: one hero challenge tile + compact status tiles.
 * Every tile is bound to live data (daily_missions, profiles, contracts, vault).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BookOpen, CheckCircle2, ChevronRight, Coins, Flame, Loader2, Lock, Play, PlusCircle,
  RefreshCw, Target, Zap,
} from 'lucide-react';
import LogClassSheet from '@/components/LogClassSheet';
import MissionCard, { TYPE_LABEL, type MissionBlock } from './MissionCard';
import RewardVault from './RewardVault';
import ContractStrip from './ContractStrip';
import ChainDots from './ChainDots';
import ComboBar from './ComboBar';

import { usePlannerMission, type PrepMode } from '@/hooks/usePlannerMission';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

const PREP_MODES: Array<{ value: PrepMode; label: string; desc: string }> = [
  { value: 'guided', label: 'Full guidance', desc: 'We decide what you study' },
  { value: 'companion', label: 'Companion', desc: 'Coaching or school plus practice' },
  { value: 'hybrid', label: 'Hybrid', desc: 'Self-study with some classes' },
  { value: 'dropper', label: 'Dropper', desc: 'Full-time prep, 8+ hrs a day' },
];


const MINUTE_CHOICES = [60, 90, 120, 150, 180, 240];
const formatTime = (m: number) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);

const tileBase =
  'relative overflow-hidden rounded-[28px] border border-border/60 bg-card p-4 transition-shadow';

function Tile({
  children, className = '', delay = 0, testId,
}: { children: React.ReactNode; className?: string; delay?: number; testId?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 24 }}
      data-testid={testId}
      className={`${tileBase} ${className}`}
    >
      {children}
    </motion.div>
  );
}

function StatTile({
  label, value, sub, icon, accent, delay,
}: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string; delay: number }) {
  return (
    <Tile delay={delay} className="flex flex-col justify-between min-h-[112px]">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-2xl ${accent}`}>{icon}</div>
      <div className="mt-3">
        <p className="text-[26px] font-extrabold leading-none tabular-nums tracking-tight">{value}</p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        {sub && <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{sub}</p>}
      </div>
    </Tile>
  );
}

export default function BentoBoard() {
  const navigate = useNavigate();
  const p = usePlannerMission();

  const [setupMode, setSetupMode] = useState<PrepMode>('guided');
  const [setupMinutes, setSetupMinutes] = useState(120);
  const [sheetBlock, setSheetBlock] = useState<MissionBlock | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const contractsEnabled = useFeatureFlag('streak_contracts');
  const vaultEnabled = useFeatureFlag('reward_vault');
  const classLogEnabled = useFeatureFlag('class_log');

  const { blocks, doneCount, total, allDone, activeIndex, activeBlock, streak, points, combo } = p;

  const start = async (block: MissionBlock) => {
    await p.startBlock(block);
    navigate(block.action_href);
  };

  if (p.loading) {
    return (
      <div className={`${tileBase} flex flex-col items-center gap-2 py-14 text-muted-foreground`}>
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm font-medium">Building today's board…</p>

      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="planner-bento">
      {total > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="mission-chain">
          {/* HERO */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            className="col-span-2 lg:col-span-4"
          >
            <div className="rounded-[32px] border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 shadow-[0_18px_50px_-30px_hsl(var(--primary)/0.6)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-primary">Today</p>
                <p className="text-sm font-extrabold tabular-nums">
                  {doneCount}<span className="font-medium text-muted-foreground">/{total}</span>
                </p>
              </div>

              {activeBlock ? (
                <div className="mt-3">
                  <MissionCard
                    key={activeBlock.id}
                    block={activeBlock}
                    index={activeIndex}
                    total={total}
                    state="active"
                    elapsedSeconds={p.elapsed}
                    onStart={() => void start(activeBlock)}
                    onInfo={() => setSheetBlock(activeBlock)}
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-5 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" strokeWidth={2.5} />
                  <p className="mt-2 text-sm font-extrabold">All done</p>
                  <p className="text-[11px] font-medium text-muted-foreground">Open the vault — new steps tomorrow.</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* STREAK */}
          <StatTile
            delay={0.05}
            label="Streak"
            value={`${streak?.current ?? 0}d`}
            sub={streak?.today_done ? 'Safe' : 'At risk'}
            icon={<Flame className="h-4 w-4 text-orange-600" />}
            accent="bg-orange-500/10"
          />


          {/* POINTS */}
          <StatTile
            delay={0.1}
            label="Points"
            value={points.toLocaleString('en-IN')}
            icon={<Coins className="h-4 w-4 text-amber-600" />}
            accent="bg-amber-500/10"
          />


          {/* CHAIN */}
          <Tile delay={0.15} className="col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Chain</p>
              <p className="text-sm font-extrabold tabular-nums">
                {doneCount}<span className="font-medium text-muted-foreground">/{total}</span>
              </p>
            </div>
            <ChainDots total={total} doneCount={doneCount} activeIndex={activeIndex} />
            <div className="mt-2 space-y-1.5">
              {blocks.map((b, i) => {
                const done = (b.progress?.status ?? 'pending') === 'done';
                if (done) {
                  return (
                    <div key={b.id} data-testid="mission-card-done" className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={3} />
                      <span className="truncate line-through">{b.title}</span>
                      <span className="ml-auto shrink-0 text-amber-600">+{b.xp_reward ?? 0}</span>
                    </div>
                  );
                }
                if (i === activeIndex) return null;
                return (
                  <div key={b.id} data-testid="mission-card-locked" className="flex select-none items-center gap-2 text-[11px] font-semibold text-muted-foreground/70">
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate blur-[2px]">{b.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] uppercase">Step {i + 1}</span>
                  </div>
                );
              })}
            </div>
          </Tile>

          {/* COMBO */}
          <Tile delay={0.2} className="col-span-2 lg:col-span-2 flex flex-col justify-between min-h-[112px]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Combo</p>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-primary/10">
                <Zap className="h-4 w-4 text-primary" />
              </span>
            </div>
            <div className="mt-3">
              <ComboBar combo={combo} />
            </div>

          </Tile>

          {/* CONTRACT */}
          {contractsEnabled && (
            <div className="col-span-2 lg:col-span-2">
              <ContractStrip />
            </div>
          )}

          {/* VAULT */}
          {vaultEnabled && (
            <div className="col-span-2 lg:col-span-2">
              <RewardVault unlocked={allDone} />
            </div>
          )}
        </div>
      )}

      {/* Refresh + rewards row */}
      {total > 0 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            disabled={p.generating}
            onClick={() => void p.generate(true)}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${p.generating ? 'animate-spin' : ''}`} />
            New board
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto rounded-2xl" onClick={() => navigate('/rewards')}>
            Rewards <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!p.needsSetup && total === 0 && (
        <div className="rounded-[28px] border border-dashed border-primary/40 bg-primary/5 p-6 text-center">
          <Target className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-2 text-sm font-extrabold">No board yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Solve a few questions and today's steps appear here.</p>
          <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
            <Button size="sm" className="rounded-2xl" onClick={() => navigate('/practice')}>
              <Play className="mr-1 h-3.5 w-3.5" /> Start practice
            </Button>
            <Button size="sm" variant="outline" className="rounded-2xl" disabled={p.generating} onClick={() => void p.generate(true)}>
              {p.generating ? 'Building…' : 'Build board'}
            </Button>
          </div>
        </div>
      )}


      {/* Log class */}
      {classLogEnabled && !p.needsSetup && (p.prepMode === 'companion' || p.prepMode === 'hybrid') && (
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="flex w-full items-center justify-between rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5 text-left transition hover:bg-primary/10"
        >
          <div className="flex min-w-0 items-center gap-2">
            {p.loggedToday
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              : <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />}
            <span className="truncate text-xs font-semibold">
              {p.loggedToday ? `Class logged: ${p.loggedToday.chapter_name ?? p.loggedToday.subject}` : "Log today's class"}
            </span>
          </div>
          <PlusCircle className="h-3.5 w-3.5 shrink-0 text-primary" />
        </button>
      )}

      {/* Challenge details */}
      <Sheet open={!!sheetBlock} onOpenChange={(v) => { if (!v) setSheetBlock(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {sheetBlock && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="text-base font-extrabold">
                  {TYPE_LABEL[sheetBlock.type]} · {sheetBlock.title}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3 py-4 text-sm leading-snug">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="rounded-lg bg-muted px-2 py-1 tabular-nums">{sheetBlock.question_count} Q</span>
                  <span className="rounded-lg bg-muted px-2 py-1">{sheetBlock.minutes}m</span>
                  <span className="rounded-lg bg-amber-500/10 px-2 py-1 text-amber-600">+{sheetBlock.xp_reward ?? 0} pts</span>
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  Goal: {sheetBlock.passing_goal ?? Math.ceil(sheetBlock.question_count * 0.6)}/{sheetBlock.question_count} correct
                </p>
              </div>
              {(sheetBlock.progress?.status ?? 'pending') !== 'done' && (
                <Button
                  className="h-11 w-full rounded-2xl font-extrabold uppercase"
                  onClick={() => { const b = sheetBlock; setSheetBlock(null); void start(b); }}
                >
                  <Play className="mr-1.5 h-4 w-4" /> Start
                </Button>
              )}

            </>
          )}
        </SheetContent>
      </Sheet>

      {/* First-time setup */}
      <Dialog open={p.needsSetup} onOpenChange={(v) => { if (!v) p.setNeedsSetup(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>2 quick questions</DialogTitle>
            <DialogDescription>
              We build your daily board from these. Change anytime in Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">How are you preparing?</p>

              <div className="grid gap-2">
                {PREP_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSetupMode(m.value)}
                    className={`rounded-xl border p-3 text-left transition ${
                      setupMode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Daily time</p>
              <div className="grid grid-cols-3 gap-2">
                {MINUTE_CHOICES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSetupMinutes(m)}
                    className={`rounded-xl border p-2.5 text-sm font-semibold transition ${
                      setupMinutes === m ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {formatTime(m)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" disabled={p.generating} onClick={() => void p.saveSetup(setupMode, setupMinutes)}>
              {p.generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Build my challenges
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogClassSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        onLogged={async () => { await p.loadAll(); await p.generate(true); }}
      />
    </div>
  );
}

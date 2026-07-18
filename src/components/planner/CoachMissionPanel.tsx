/**
 * CoachMissionPanel — v4: "Aaj ki Hit-List"
 * Sequential auto-ticking to-do list. One task in focus at a time.
 * • Header: streak + today's progress (percentile hidden — Slice 2 will add XP)
 * • Rows: done (struck + green tick), current (expanded + Start), upcoming (dimmed)
 * • Auto-tick as questions solve (realtime + visibility refetch)
 * • Tap row → bottom sheet with Kyun/Kya/Goal (no walls of text on main screen)
 * • On all done → clean celebration card + tomorrow teaser
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  Play, CheckCircle2, RefreshCw, Sparkles, Loader2, BookOpen, PlusCircle,
  Flame, Trophy, Circle, Info,
} from 'lucide-react';
import LogClassSheet from '@/components/LogClassSheet';

interface CoachSignal {
  streak?: { current: number; best: number; today_done: boolean };
  nudge: { emoji: string; message: string; tone: 'push' | 'praise' | 'warn' } | null;
}

type BlockType = 'learn_practice' | 'revision' | 'weak_fix' | 'class_recap' | 'pyq' | 'mock';
interface BlockProgress {
  attempted: number;
  correct: number;
  status: 'pending' | 'in_progress' | 'done';
  seen_ids?: string[];
}
interface MissionBlock {
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
  progress?: BlockProgress;
}
interface DailyMission {
  id: string;
  mission_date: string;
  prep_mode: 'guided' | 'companion' | 'dropper' | 'hybrid';
  total_minutes: number;
  blocks: MissionBlock[];
  reasoning: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_blocks: number;
}

const PREP_MODES: Array<{ value: DailyMission['prep_mode']; label: string; desc: string }> = [
  { value: 'guided',    label: 'Full guidance', desc: 'JEEnie decide karegi sab' },
  { value: 'companion', label: 'Companion',     desc: 'Coaching / school + practice help' },
  { value: 'hybrid',    label: 'Hybrid',        desc: 'Self-study + kuch classes' },
  { value: 'dropper',   label: 'Dropper',       desc: 'Full-time prep, 8+ hrs/day' },
];

const MINUTE_CHOICES = [60, 90, 120, 150, 180, 240];

const typeAccent: Record<BlockType, string> = {
  learn_practice: 'text-blue-600',
  revision:       'text-amber-600',
  weak_fix:       'text-rose-600',
  class_recap:    'text-emerald-600',
  pyq:            'text-violet-600',
  mock:           'text-orange-600',
};

const typeShort: Record<BlockType, string> = {
  learn_practice: 'Learn',
  revision: 'Revise',
  weak_fix: 'Weak-fix',
  class_recap: 'Recap',
  pyq: 'PYQ',
  mock: 'Mock',
};

function formatTime(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function CoachMissionPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mission, setMission] = useState<DailyMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<DailyMission['prep_mode']>('guided');
  const [setupMinutes, setSetupMinutes] = useState<number>(120);
  const [prepMode, setPrepMode] = useState<DailyMission['prep_mode'] | null>(null);
  const [loggedToday, setLoggedToday] = useState<{ id: string; chapter_name: string | null; subject: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [signal, setSignal] = useState<CoachSignal | null>(null);
  const [sheetBlock, setSheetBlock] = useState<MissionBlock | null>(null);
  const [justCompleted, setJustCompleted] = useState<Set<string>>(new Set());

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-mission', { body: { force } });
      if (error) throw error;
      const m = (data as { mission?: DailyMission } | null)?.mission;
      if (m) setMission(m);
    } catch (e) {
      console.error(e);
      toast.error('Mission generate nahi ho payi — thodi der mein retry karo');
    } finally {
      setGenerating(false);
    }
  }, []);

  const refreshMissionOnly = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data: existing } = await supabase
      .from('daily_missions')
      .select('*')
      .eq('user_id', user.id)
      .eq('mission_date', today)
      .maybeSingle();
    if (existing) setMission(existing as unknown as DailyMission);
  }, [user?.id]);

  const loadOrSetup = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, prep_mode, daily_study_minutes, prep_mode_set_at')
        .eq('id', user.id)
        .maybeSingle();

      const mode = ((profile as any)?.prep_mode as DailyMission['prep_mode']) ?? 'guided';
      setPrepMode(mode);

      if (!(profile as any)?.prep_mode_set_at) {
        setSetupMode(mode);
        setSetupMinutes((profile as any)?.daily_study_minutes ?? 120);
        setNeedsSetup(true);
        setLoading(false);
        return;
      }

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      const { data: todayLog } = await supabase
        .from('class_logs')
        .select('id, chapter_name, subject')
        .eq('user_id', user.id)
        .eq('logged_date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLoggedToday(todayLog ?? null);

      const { data: existing } = await supabase
        .from('daily_missions')
        .select('*')
        .eq('user_id', user.id)
        .eq('mission_date', today)
        .maybeSingle();

      const isLegacy = existing?.blocks && Array.isArray(existing.blocks) &&
        existing.blocks.length > 0 && (
          !(existing.blocks as any[])[0]?.progress ||
          (existing.blocks as any[])[0]?.xp_reward == null
        );

      if (existing && !isLegacy) {
        setMission(existing as unknown as DailyMission);
      } else {
        await generate(true);
      }

      // Streak/nudge only — percentile hidden
      supabase.functions.invoke('compute-coach-signal').then(({ data }) => {
        if (data) {
          const s = data as any;
          setSignal({ streak: s.streak, nudge: s.nudge });
        }
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [user?.id, generate]);

  useEffect(() => { void loadOrSetup(); }, [loadOrSetup]);

  // Realtime — live update as user solves questions
  useEffect(() => {
    if (!user?.id || !mission?.id) return;
    const channel = supabase
      .channel(`mission-${mission.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_missions', filter: `id=eq.${mission.id}` },
        (payload) => setMission(payload.new as DailyMission),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, mission?.id]);

  // Refetch on tab visibility change — catches missed realtime events
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void refreshMissionOnly(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshMissionOnly]);

  // Detect newly-completed blocks → briefly animate the tick
  useEffect(() => {
    if (!mission) return;
    const done = mission.blocks.filter(b => (b.progress?.status ?? 'pending') === 'done').map(b => b.id);
    setJustCompleted(prev => {
      const next = new Set(prev);
      done.forEach(id => {
        if (!prev.has(id)) {
          next.add(id);
          setTimeout(() => {
            setJustCompleted(cur => {
              const c = new Set(cur); c.delete(id); return c;
            });
          }, 1600);
        }
      });
      return next;
    });
  }, [mission]);

  const saveSetup = async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        prep_mode: setupMode,
        daily_study_minutes: setupMinutes,
        prep_mode_set_at: new Date().toISOString(),
      } as any)
      .eq('id', user.id);
    if (error) { toast.error(error.message); return; }
    setNeedsSetup(false);
    await generate(true);
    toast.success('Aaj ki hit-list ready hai 🚀');
  };

  const startBlock = async (block: MissionBlock) => {
    if (!mission || !user?.id) return;
    if (mission.status === 'pending') {
      await supabase
        .from('daily_missions')
        .update({ status: 'in_progress', started_at: new Date().toISOString() } as any)
        .eq('id', mission.id);
    }
    navigate(block.action_href);
  };

  const doneCount = useMemo(() => {
    if (!mission) return 0;
    return mission.blocks.filter(b => (b.progress?.status ?? 'pending') === 'done').length;
  }, [mission]);
  const totalCount = mission?.blocks?.length ?? 0;
  const allDone = totalCount > 0 && doneCount >= totalCount;
  const overallPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const xpEarned = useMemo(() =>
    (mission?.blocks ?? [])
      .filter(b => (b.progress?.status ?? 'pending') === 'done')
      .reduce((s, b) => s + (b.xp_reward ?? 0), 0),
  [mission]);
  const xpTotal = useMemo(() =>
    (mission?.blocks ?? []).reduce((s, b) => s + (b.xp_reward ?? 0), 0) + 100, // +100 completion bonus
  [mission]);

  // First non-done block = the "current" focus row
  const currentBlockId = useMemo(() => {
    if (!mission) return null;
    const found = mission.blocks.find(b => (b.progress?.status ?? 'pending') !== 'done');
    return found?.id ?? null;
  }, [mission]);

  const tomorrowTeaser = useMemo(() => {
    if (!mission) return null;
    const weak = mission.blocks.find(b => b.type === 'weak_fix');
    if (weak?.chapter_name) return `Kal ${weak.chapter_name} ka chapter test open hoga`;
    const learn = mission.blocks.find(b => b.type === 'learn_practice');
    if (learn?.chapter_name) return `Kal ${learn.chapter_name} ke next-level Qs`;
    return 'Kal fresh hit-list — PYQ + weak-spot fix';
  }, [mission]);

  return (
    <div className="space-y-3">
      {/* Header — streak + refresh (percentile hidden) */}
      {!loading && !needsSetup && (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5">
          {signal?.streak && signal.streak.current > 0 ? (
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              signal.streak.today_done ? 'bg-orange-500/15 text-orange-600' : 'bg-muted text-muted-foreground'
            }`}>
              <Flame className="w-3.5 h-3.5" />
              <span className="tabular-nums">{signal.streak.current}d streak</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
              <Flame className="w-3.5 h-3.5" />
              <span>Start streak</span>
            </div>
          )}
          {mission && (
            <div className="flex-1 flex items-center justify-end gap-2">
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-bold tabular-nums">
                <Trophy className="w-3 h-3" />
                {xpEarned}<span className="text-amber-600/60 font-normal">/{xpTotal} XP</span>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold leading-none">Aaj</p>
                <p className="text-sm font-bold tabular-nums leading-tight mt-0.5">{doneCount}<span className="text-muted-foreground font-normal">/{totalCount}</span></p>
              </div>
            </div>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => generate(true)} disabled={generating}>
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {loading && (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Aaj ki hit-list bana raha hu…</p>
          </CardContent>
        </Card>
      )}

      {/* HIT-LIST */}
      {!loading && mission && !allDone && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Aaj ki Hit-List
            </p>
            <span className="text-[10px] text-muted-foreground tabular-nums">{overallPct}%</span>
          </div>
          <Progress value={overallPct} className="h-1.5" />

          <ul className="space-y-2 pt-1">
            {mission.blocks.map((b) => {
              const prog = b.progress ?? { attempted: 0, correct: 0, status: 'pending' as const };
              const isDone = prog.status === 'done';
              const isCurrent = !isDone && b.id === currentBlockId;
              const isUpcoming = !isDone && !isCurrent;
              const target = b.question_count || 10;
              const attemptPct = Math.min(100, Math.round((prog.attempted / Math.max(1, target)) * 100));
              const wasJustDone = justCompleted.has(b.id);

              return (
                <li
                  key={b.id}
                  className={`group rounded-xl border transition-all overflow-hidden ${
                    isDone
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : isCurrent
                      ? 'border-primary/50 bg-primary/5 shadow-sm'
                      : 'border-border/60 bg-card opacity-70'
                  } ${wasJustDone ? 'animate-scale-in' : ''}`}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Tick / bullet */}
                    <button
                      type="button"
                      onClick={() => setSheetBlock(b)}
                      className="shrink-0"
                      aria-label="Task details"
                    >
                      {isDone ? (
                        <div className={`w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center ${wasJustDone ? 'animate-scale-in' : ''}`}>
                          <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={3} />
                        </div>
                      ) : isCurrent ? (
                        <div className="relative">
                          <Circle className="w-6 h-6 text-primary" strokeWidth={2.5} />
                          <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
                        </div>
                      ) : (
                        <Circle className="w-6 h-6 text-muted-foreground/40" strokeWidth={2} />
                      )}
                    </button>

                    {/* Body */}
                    <button
                      type="button"
                      onClick={() => setSheetBlock(b)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className={`text-sm font-semibold leading-tight truncate ${
                        isDone ? 'line-through text-muted-foreground' : ''
                      }`}>
                        {b.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-semibold ${typeAccent[b.type]}`}>{typeShort[b.type]}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {isDone ? `${target}/${target}` : `${prog.attempted}/${target} Q`}
                        </span>
                        {!isDone && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground">{b.minutes}m</span>
                          </>
                        )}
                        {!!b.xp_reward && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] font-bold text-amber-600">+{b.xp_reward} XP</span>
                          </>
                        )}
                      </div>
                      {isCurrent && prog.attempted > 0 && (
                        <div className="mt-2">
                          <Progress value={attemptPct} className="h-1" />
                        </div>
                      )}
                    </button>

                    {/* Action */}
                    {isCurrent && (
                      <Button size="sm" className="h-9 px-3 shrink-0" onClick={() => startBlock(b)}>
                        <Play className="w-3.5 h-3.5 mr-1" />
                        {prog.attempted > 0 ? 'Continue' : 'Start'}
                      </Button>
                    )}
                    {isUpcoming && (
                      <button
                        type="button"
                        onClick={() => setSheetBlock(b)}
                        className="shrink-0 p-1 text-muted-foreground/60 hover:text-foreground"
                        aria-label="Info"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-[10px] text-center text-muted-foreground pt-1">
            Solve karte hi khud tick lag jayega ✨
          </p>
        </div>
      )}

      {/* ALL DONE — celebration */}
      {!loading && mission && allDone && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-6 space-y-4 relative overflow-hidden animate-scale-in">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
          <div className="relative text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500 flex items-center justify-center animate-scale-in">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">Hit-List clear! 🎯</p>
            <p className="text-xs text-muted-foreground">Saare {totalCount} tasks done. Aaj tu winner.</p>
          </div>

          {signal?.streak && signal.streak.current > 0 && (
            <div className="relative flex items-center justify-center gap-2 py-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <Flame className="w-4 h-4 text-orange-600" />
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                {signal.streak.current}-day streak alive 🔥
              </p>
            </div>
          )}

          {tomorrowTeaser && (
            <div className="relative rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-primary/80 mb-1">Kal ka teaser</p>
              <p className="text-xs">{tomorrowTeaser}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Aaj raat 12 baje unlock</p>
            </div>
          )}
        </div>
      )}

      {/* Log class — small chip only for companion/hybrid */}
      {!loading && !needsSetup && (prepMode === 'companion' || prepMode === 'hybrid') && (
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {loggedToday ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
            )}
            <span className="text-xs truncate">
              {loggedToday
                ? `Class logged: ${loggedToday.chapter_name ?? loggedToday.subject}`
                : "Log aaj ki class"}
            </span>
          </div>
          <PlusCircle className="w-3.5 h-3.5 text-primary shrink-0" />
        </button>
      )}

      {/* Task detail bottom-sheet — Kyun / Kya / Goal */}
      <Sheet open={!!sheetBlock} onOpenChange={(v) => { if (!v) setSheetBlock(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          {sheetBlock && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${typeAccent[sheetBlock.type]}`}>
                    {typeShort[sheetBlock.type]}
                  </span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span>{sheetBlock.title}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3 py-4 text-sm leading-snug">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Kyun</p>
                  <p className="text-foreground/90">{sheetBlock.why}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Kya</p>
                  <p className="text-foreground/90">
                    {sheetBlock.what || `${sheetBlock.question_count} Q solve karo (~${sheetBlock.minutes} min)`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Goal</p>
                  <p className="text-foreground/90">
                    {sheetBlock.goal || `${sheetBlock.passing_goal ?? Math.ceil(sheetBlock.question_count * 0.6)}/${sheetBlock.question_count} sahi = auto-tick ✅`}
                  </p>
                </div>
              </div>
              {(sheetBlock.progress?.status ?? 'pending') !== 'done' && (
                <Button
                  className="w-full"
                  onClick={() => { const b = sheetBlock; setSheetBlock(null); void startBlock(b); }}
                >
                  <Play className="w-4 h-4 mr-1.5" />
                  {(sheetBlock.progress?.attempted ?? 0) > 0 ? 'Continue' : 'Start'}
                </Button>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* First-time setup */}
      <Dialog open={needsSetup} onOpenChange={(v) => { if (!v) setNeedsSetup(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>2 quick questions</DialogTitle>
            <DialogDescription>
              JEEnie decides your daily hit-list based on these — change later in Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">How are you preparing?</p>
              <div className="grid gap-2">
                {PREP_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSetupMode(m.value)}
                    className={`text-left p-3 rounded-lg border transition ${
                      setupMode === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Daily time on JEEnie</p>
              <div className="grid grid-cols-3 gap-2">
                {MINUTE_CHOICES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setSetupMinutes(m)}
                    className={`p-2.5 rounded-lg border text-sm font-semibold transition ${
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
            <Button onClick={saveSetup} className="w-full" disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Build my hit-list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogClassSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        onLogged={async () => { await loadOrSetup(); await generate(true); }}
      />
    </div>
  );
}

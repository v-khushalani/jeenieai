/**
 * CoachMissionPanel — v3: minimal, curiosity-driven.
 * • Sticky header: streak + percentile + refresh
 * • Mission blocks: 1 line + type dot + progress + Start (Kyun/Kya/Goal on tap)
 * • Secondary content (weekly report, JEEnie note, nudge, streak risk, rank chase)
 *   collapsed inside "Why these?" — default hidden.
 * • MissionCompleteCard on all-done: percentile pop + streak flame + tomorrow teaser
 * • Live sync: realtime + visibility refetch
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Play, CheckCircle2, RefreshCw, Sparkles, ChevronDown, Clock, Loader2,
  BookOpen, PlusCircle, TrendingUp, TrendingDown, Flame, Trophy, Target,
} from 'lucide-react';
import LogClassSheet from '@/components/LogClassSheet';

interface CoachSignal {
  prediction: {
    exam: string;
    on_track_percentile: number;
    off_track_percentile: number;
    delta: number;
    trend: 'up' | 'flat' | 'down';
    confidence: 'low' | 'medium' | 'high';
  };
  streak?: { current: number; best: number; today_done: boolean };
  weekly_report?: {
    week_start: string;
    active_days: number;
    total_questions: number;
    accuracy: number;
    accuracy_change: number;
    top_subject: string | null;
    weakest_subject: string | null;
    focus_next_week: string;
  } | null;
  nudge: { emoji: string; message: string; tone: 'push' | 'praise' | 'warn' } | null;
  factors?: Record<string, unknown>;
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

const typeDot: Record<BlockType, string> = {
  learn_practice: 'bg-blue-500',
  revision:       'bg-amber-500',
  weak_fix:       'bg-rose-500',
  class_recap:    'bg-emerald-500',
  pyq:            'bg-violet-500',
  mock:           'bg-orange-500',
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
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [prepMode, setPrepMode] = useState<DailyMission['prep_mode'] | null>(null);
  const [loggedToday, setLoggedToday] = useState<{ id: string; chapter_name: string | null; subject: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [signal, setSignal] = useState<CoachSignal | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-mission', { body: { force } });
      if (error) throw error;
      const m = (data as { mission?: DailyMission } | null)?.mission;
      if (m) {
        setMission(m);
        const firstPending = m.blocks.find(b => (b.progress?.status ?? 'pending') !== 'done');
        if (firstPending) setExpandedBlock(firstPending.id);
      }
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
        existing.blocks.length > 0 && !(existing.blocks as any[])[0]?.progress;

      if (existing && !isLegacy) {
        setMission(existing as unknown as DailyMission);
        const firstPending = (existing.blocks as unknown as MissionBlock[]).find(
          b => (b.progress?.status ?? 'pending') !== 'done',
        );
        if (firstPending) setExpandedBlock(firstPending.id);
      } else {
        await generate(true);
      }

      supabase.functions.invoke('compute-coach-signal').then(({ data }) => {
        if (data && (data as CoachSignal).prediction) setSignal(data as CoachSignal);
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
    toast.success('Aaj ki mission ready hai 🚀');
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
  const nextBlock = mission?.blocks.find(b => (b.progress?.status ?? 'pending') !== 'done');
  const tomorrowTeaser = useMemo(() => {
    if (!mission) return null;
    const weak = mission.blocks.find(b => b.type === 'weak_fix');
    if (weak?.chapter_name) return `Kal ${weak.chapter_name} ka chapter test open hoga`;
    const learn = mission.blocks.find(b => b.type === 'learn_practice');
    if (learn?.chapter_name) return `Kal ${learn.chapter_name} ke next-level Qs`;
    return 'Kal fresh mission — PYQ + weak-spot fix';
  }, [mission]);

  return (
    <div className="space-y-3">
      {/* Sticky-ish header: streak · percentile · refresh */}
      {!loading && !needsSetup && (signal?.prediction || signal?.streak) && (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
          {signal?.streak && signal.streak.current > 0 && (
            <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${
              signal.streak.today_done ? 'bg-orange-500/15 text-orange-600' : 'bg-muted text-muted-foreground'
            }`}>
              <Flame className="w-3.5 h-3.5" />
              <span className="tabular-nums">{signal.streak.current}d</span>
            </div>
          )}
          {signal?.prediction && (
            <div className="flex items-baseline gap-1.5 flex-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Percentile</span>
              <span className="text-lg font-bold tabular-nums">{signal.prediction.on_track_percentile}</span>
              {signal.prediction.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />}
              {signal.prediction.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-600" />}
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
            <p className="text-sm">Aaj ki mission taiyaar kar raha hu…</p>
          </CardContent>
        </Card>
      )}

      {/* MISSION LIST — minimal cards */}
      {!loading && mission && !allDone && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
              Aaj · {doneCount}/{totalCount} done
            </p>
            <span className="text-[10px] text-muted-foreground">{formatTime(mission.total_minutes)}</span>
          </div>
          <Progress value={overallPct} className="h-1" />

          {mission.blocks.map((b) => {
            const prog = b.progress ?? { attempted: 0, correct: 0, status: 'pending' as const };
            const isDone = prog.status === 'done';
            const isInProgress = prog.status === 'in_progress';
            const isExpanded = expandedBlock === b.id;
            const target = b.question_count || 10;
            const attemptPct = Math.min(100, Math.round((prog.attempted / Math.max(1, target)) * 100));
            const passingGoal = b.passing_goal ?? Math.max(1, Math.ceil(target * 0.6));

            return (
              <div
                key={b.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isDone ? 'border-emerald-500/40 bg-emerald-500/5' :
                  isInProgress ? 'border-primary/40 bg-primary/5' :
                  'border-border bg-card'
                }`}
              >
                <div className="flex items-center gap-2.5 p-3">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${typeDot[b.type]}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight truncate ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                      {b.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{typeShort[b.type]}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {isDone || prog.attempted > 0 ? `${prog.attempted}/${target}` : `${target} Q · ${b.minutes}m`}
                      </span>
                      {(prog.attempted > 0 || isDone) && (
                        <div className="flex-1 max-w-[80px]">
                          <Progress value={attemptPct} className="h-1" />
                        </div>
                      )}
                    </div>
                  </div>
                  {!isDone && (
                    <Button size="sm" className="h-8 px-3 shrink-0" onClick={() => startBlock(b)}>
                      <Play className="w-3 h-3 mr-1" />
                      {isInProgress ? 'Continue' : 'Start'}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => setExpandedBlock(isExpanded ? null : b.id)}
                    className="p-1 -mr-1 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Details"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-border/50 space-y-1 text-[11px] leading-snug">
                    <p className="pt-2"><span className="font-semibold">Kyun: </span><span className="text-muted-foreground">{b.why}</span></p>
                    <p><span className="font-semibold">Kya: </span><span className="text-muted-foreground">{b.what || `${target} Q solve karo (~${b.minutes} min)`}</span></p>
                    <p><span className="font-semibold">Goal: </span><span className="text-muted-foreground">{b.goal || `${passingGoal}/${target} sahi = done ✅`}</span></p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MISSION COMPLETE — curiosity hook */}
      {!loading && mission && allDone && (
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-5 space-y-4 overflow-hidden relative">
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
          <div className="relative text-center space-y-1">
            <Trophy className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Mission clear! 🔥</p>
            {signal?.prediction && (
              <p className="text-xs text-muted-foreground">
                Percentile <span className="font-bold text-foreground tabular-nums">{signal.prediction.on_track_percentile}</span> pe lock
                <span className="text-emerald-600 font-bold"> +{signal.prediction.delta.toFixed(1)}</span>
              </p>
            )}
          </div>

          {signal?.streak && signal.streak.current > 0 && (
            <div className="relative flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
              <Flame className="w-4 h-4 text-orange-600" />
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                {signal.streak.current}-day streak alive · kal 1 block se aage
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

      {/* "Why these?" — everything secondary tucked here */}
      {!loading && !needsSetup && mission && (signal || mission.reasoning) && (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setWhyOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              JEEnie note {whyOpen ? '' : '· tap to expand'}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${whyOpen ? 'rotate-180' : ''}`} />
          </button>
          {whyOpen && (
            <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border/50">
              {mission.reasoning && (
                <p className="pt-3 text-[11px] leading-snug text-muted-foreground">{mission.reasoning}</p>
              )}
              {signal?.nudge && (
                <div className={`flex items-start gap-2 rounded-lg p-2.5 text-[11px] leading-snug ${
                  signal.nudge.tone === 'praise' ? 'bg-emerald-500/8 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' :
                  signal.nudge.tone === 'warn' ? 'bg-amber-500/8 text-amber-800 dark:text-amber-300 border border-amber-500/20' :
                  'bg-primary/8 text-primary border border-primary/20'
                }`}>
                  <span className="text-base leading-none">{signal.nudge.emoji}</span>
                  <span className="flex-1">{signal.nudge.message}</span>
                </div>
              )}
              {signal?.prediction && (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-muted-foreground">Skip today</p>
                    <p className="font-bold text-rose-600 tabular-nums">{signal.prediction.off_track_percentile}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-muted-foreground">On-track gain</p>
                    <p className="font-bold text-emerald-600 tabular-nums">+{signal.prediction.delta.toFixed(1)}</p>
                  </div>
                </div>
              )}
              {signal?.weekly_report && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 text-[11px]">
                  <p className="font-semibold flex items-center gap-1"><Trophy className="w-3 h-3 text-primary" /> This week</p>
                  <p className="text-muted-foreground mt-0.5">
                    {signal.weekly_report.active_days}/7 days · {signal.weekly_report.total_questions} Q · {signal.weekly_report.accuracy}% acc
                  </p>
                  <p className="text-muted-foreground mt-1">Focus: {signal.weekly_report.focus_next_week}</p>
                </div>
              )}
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

      {/* First-time setup */}
      <Dialog open={needsSetup} onOpenChange={(v) => { if (!v) setNeedsSetup(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>2 quick questions</DialogTitle>
            <DialogDescription>
              JEEnie decides your daily mission based on these — change later in Settings.
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
              Build my mission
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

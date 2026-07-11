/**
 * CoachMissionPanel — Coach-first hero for AI Planner.
 * v2: block cards show why/what/goal + live progress; subscribes to daily_missions
 * realtime so progress updates the moment a question is solved anywhere.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Play, CheckCircle2, RefreshCw, Sparkles, ChevronRight, Clock, Loader2, Info,
  BookOpen, PlusCircle, TrendingUp, TrendingDown, Minus, Flame, Trophy, Target,
  MessageCircle, Users,
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

const typeAccent: Record<BlockType, string> = {
  learn_practice: 'bg-primary/10 text-primary border-primary/30',
  revision:       'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  weak_fix:       'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30',
  class_recap:    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  pyq:            'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30',
  mock:           'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
};

const typeLabel: Record<BlockType, string> = {
  learn_practice: 'Learn + Practice',
  revision: 'Revision',
  weak_fix: 'Weak-spot fix',
  class_recap: 'Class recap',
  pyq: 'PYQs',
  mock: 'Mock',
};

const typeEmoji: Record<BlockType, string> = {
  learn_practice: '🔵',
  revision: '🟡',
  weak_fix: '🔴',
  class_recap: '🟢',
  pyq: '🟣',
  mock: '🟠',
};

function formatTime(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function buildCoachGreeting(signal: CoachSignal | null, mission: DailyMission | null, name?: string): string {
  if (!mission || !signal) return '';
  const firstBlock = mission.blocks.find(b => (b.progress?.status ?? 'pending') !== 'done');
  const p = signal.prediction;
  const nm = name?.split(' ')[0] || 'champ';
  if (!firstBlock) {
    return `Shabaash ${nm}! Aaj ka mission 100% done — percentile ${p.on_track_percentile} pe lock.`;
  }
  const target = firstBlock.what || `${firstBlock.question_count} Q`;
  const gain = Math.max(0.3, p.delta).toFixed(1);
  return `${nm}, ${firstBlock.minutes} min ka ek block — ${target}. Complete kar liya toh percentile ${p.on_track_percentile} pe hold, warna ${gain} girega.`;
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
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [minutesTodayFromMe, setMinutesTodayFromMe] = useState<number>(0);

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-mission', { body: { force } });
      if (error) throw error;
      const m = (data as { mission?: DailyMission } | null)?.mission;
      if (m) {
        setMission(m);
        // auto-expand first pending block so the student sees why/what/goal
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
      setUserName((profile as any)?.full_name);

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

      // If missing OR still on the legacy shape (no progress key on blocks) → regenerate
      const isLegacy = existing?.blocks && Array.isArray(existing.blocks) &&
        existing.blocks.length > 0 && !(existing.blocks as any[])[0]?.progress;

      if (existing && !isLegacy) {
        setMission(existing as unknown as DailyMission);
        const firstPending = (existing.blocks as MissionBlock[]).find(
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

  // Realtime — reflect mission progress instantly as the student solves questions
  useEffect(() => {
    if (!user?.id || !mission?.id) return;
    const channel = supabase
      .channel(`mission-${mission.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_missions', filter: `id=eq.${mission.id}` },
        (payload) => {
          const next = payload.new as DailyMission;
          setMission(next);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, mission?.id]);

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

  const totalMinutes = mission?.total_minutes ?? 0;
  const doneCount = useMemo(() => {
    if (!mission) return 0;
    return mission.blocks.filter(b => (b.progress?.status ?? 'pending') === 'done').length;
  }, [mission]);
  const totalCount = mission?.blocks?.length ?? 0;
  const allDone = totalCount > 0 && doneCount >= totalCount;
  const overallPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const coachGreeting = buildCoachGreeting(signal, mission, userName);
  const nextBlock = mission?.blocks.find(b => (b.progress?.status ?? 'pending') !== 'done');

  return (
    <div className="space-y-3">
      {/* Sunday weekly report */}
      {!loading && signal?.weekly_report && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary/80">Your Week in Review</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-background/60">
              <p className="text-lg font-bold tabular-nums">{signal.weekly_report.active_days}<span className="text-[10px] text-muted-foreground">/7</span></p>
              <p className="text-[10px] text-muted-foreground">active days</p>
            </div>
            <div className="p-2 rounded-lg bg-background/60">
              <p className="text-lg font-bold tabular-nums">{signal.weekly_report.total_questions}</p>
              <p className="text-[10px] text-muted-foreground">questions</p>
            </div>
            <div className="p-2 rounded-lg bg-background/60">
              <p className="text-lg font-bold tabular-nums flex items-center justify-center gap-0.5">
                {signal.weekly_report.accuracy}%
                {signal.weekly_report.accuracy_change > 2 && <TrendingUp className="w-3 h-3 text-emerald-600" />}
                {signal.weekly_report.accuracy_change < -2 && <TrendingDown className="w-3 h-3 text-rose-600" />}
              </p>
              <p className="text-[10px] text-muted-foreground">accuracy</p>
            </div>
          </div>
          <p className="text-xs leading-snug">
            <span className="font-semibold">Next week: </span>
            <span className="text-muted-foreground">{signal.weekly_report.focus_next_week}</span>
          </p>
        </div>
      )}

      {/* Coach greeting (JEEnie voice) */}
      {!loading && !needsSetup && coachGreeting && (
        <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/8 to-primary/3 p-3 flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary/80">JEEnie says</p>
            <p className="text-xs leading-snug mt-0.5">{coachGreeting}</p>
          </div>
        </div>
      )}

      {/* Prediction + streak strip */}
      {!loading && !needsSetup && signal?.prediction && (
        <div className="rounded-xl border border-border/60 bg-card p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {signal.prediction.exam} — Predicted percentile
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold tabular-nums">{signal.prediction.on_track_percentile}</span>
                {signal.prediction.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-600" />}
                {signal.prediction.trend === 'down' && <TrendingDown className="w-4 h-4 text-rose-600" />}
                {signal.prediction.trend === 'flat' && <Minus className="w-4 h-4 text-muted-foreground" />}
                <span className="text-[11px] text-muted-foreground">
                  {signal.prediction.confidence === 'low' ? 'low conf.' : `${signal.prediction.confidence} conf.`}
                </span>
                {signal.streak && signal.streak.current > 0 && (
                  <span className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold
                    ${signal.streak.today_done ? 'border-orange-500/40 bg-orange-500/10 text-orange-600' : 'border-border bg-muted/50 text-muted-foreground'}`}>
                    <Flame className="w-3 h-3" />
                    <span className="tabular-nums">{signal.streak.current}d</span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Skip today</p>
              <p className="text-sm font-bold tabular-nums text-rose-600">
                {signal.prediction.off_track_percentile}
                <span className="text-[10px] text-muted-foreground font-medium ml-1">(-{signal.prediction.delta})</span>
              </p>
            </div>
          </div>
          {signal.nudge && (
            <div className={`flex items-start gap-2 rounded-lg p-2.5 text-xs leading-snug
              ${signal.nudge.tone === 'praise' ? 'bg-emerald-500/8 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20' :
                signal.nudge.tone === 'warn' ? 'bg-amber-500/8 text-amber-800 dark:text-amber-300 border border-amber-500/20' :
                'bg-primary/8 text-primary border border-primary/20'}`}>
              <span className="text-base leading-none">{signal.nudge.emoji}</span>
              <span className="flex-1">{signal.nudge.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Log today's class */}
      {!loading && !needsSetup && (prepMode === 'companion' || prepMode === 'hybrid') && (
        loggedToday ? (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Aaj ki class logged</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {loggedToday.chapter_name ?? loggedToday.subject} · {loggedToday.subject}
                </p>
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => setLogOpen(true)}>
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add another
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-primary" />
              <div className="text-left">
                <p className="text-sm font-semibold leading-tight">Aaj coaching mein kya padha?</p>
                <p className="text-[11px] text-muted-foreground">Log karo — JEEnie recap block bana degi</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-primary" />
          </button>
        )
      )}

      {loading && (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Aaj ki mission taiyaar kar raha hu…</p>
          </CardContent>
        </Card>
      )}

      {!loading && mission && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent overflow-hidden">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-widest font-bold text-primary/80">Today's Mission</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl font-bold tabular-nums">{formatTime(totalMinutes)}</span>
                  <span className="text-xs text-muted-foreground">· {doneCount}/{totalCount} blocks</span>
                </div>
                <Progress value={overallPct} className="h-1.5 mt-2" />
              </div>
              <Button size="icon" variant="ghost" onClick={() => generate(true)} disabled={generating} title="Regenerate">
                <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {mission.reasoning && (
              <p className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5">
                <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-primary/60" />
                <span>{mission.reasoning}</span>
              </p>
            )}

            <div className="space-y-2">
              {mission.blocks.map((b, idx) => {
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
                    className={`rounded-xl border transition-all ${
                      isDone ? 'border-emerald-500/40 bg-emerald-500/5' :
                      isInProgress ? 'border-primary/40 bg-primary/5' :
                      'border-border bg-background/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedBlock(isExpanded ? null : b.id)}
                      className="w-full text-left p-3 flex items-center gap-3"
                    >
                      <div className="shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        ) : (
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            isInProgress ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`h-4 text-[9px] px-1.5 ${typeAccent[b.type]}`}>
                            <span className="mr-0.5">{typeEmoji[b.type]}</span>
                            {typeLabel[b.type]}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {b.minutes} min
                          </span>
                        </div>
                        <p className={`text-sm font-semibold leading-tight mt-1 truncate ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                          {b.title}
                        </p>
                        {(prog.attempted > 0 || isDone) ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <Progress value={attemptPct} className="h-1 flex-1" />
                            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground shrink-0">
                              {prog.attempted}/{target} · {prog.correct} ✓
                            </span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground truncate">{b.subtitle}</p>
                        )}
                      </div>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/50">
                        <div className="pt-2.5 space-y-1.5 text-[11px] leading-snug">
                          <p className="flex items-start gap-1.5">
                            <Info className="w-3 h-3 mt-0.5 shrink-0 text-primary/70" />
                            <span><span className="font-bold text-foreground">Kyun: </span><span className="text-muted-foreground">{b.why}</span></span>
                          </p>
                          <p className="flex items-start gap-1.5">
                            <Play className="w-3 h-3 mt-0.5 shrink-0 text-primary/70" />
                            <span><span className="font-bold text-foreground">Kya: </span><span className="text-muted-foreground">{b.what || `${target} Q solve karo`}</span></span>
                          </p>
                          <p className="flex items-start gap-1.5">
                            <Target className="w-3 h-3 mt-0.5 shrink-0 text-primary/70" />
                            <span><span className="font-bold text-foreground">Goal: </span><span className="text-muted-foreground">{b.goal || `${passingGoal}/${target} sahi = ✅ done`}</span></span>
                          </p>
                        </div>
                        {!isDone && (
                          <Button size="sm" className="w-full" onClick={() => startBlock(b)}>
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                            {isInProgress ? `Continue (${prog.attempted}/${target})` : 'Start this block'}
                          </Button>
                        )}
                        {isDone && (
                          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Done · {prog.correct}/{prog.attempted} correct
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {allDone ? (
              <div className="relative p-4 rounded-xl bg-gradient-to-br from-emerald-500/15 via-emerald-500/8 to-transparent border border-emerald-500/40 text-center overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-24 h-24 bg-emerald-500/20 rounded-full blur-2xl animate-pulse" />
                </div>
                <div className="relative flex items-center justify-center gap-2 mb-1">
                  <Trophy className="w-5 h-5 text-emerald-600" />
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">Mission complete! 🔥</p>
                </div>
                <p className="relative text-[11px] text-muted-foreground">
                  {signal?.streak?.today_done ? `${signal.streak.current}-day streak alive · ` : ''}Kal fresh mission ready milegi.
                </p>
              </div>
            ) : nextBlock ? (
              <Button
                size="lg"
                className="w-full h-12 text-sm font-bold rounded-xl"
                onClick={() => startBlock(nextBlock)}
              >
                <Play className="w-4 h-4 mr-2" />
                {doneCount === 0 ? "START TODAY'S MISSION" : `CONTINUE (${doneCount}/${totalCount})`}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Competitive strip — streak risk + rank ticker */}
      {!loading && !needsSetup && signal?.prediction && (
        <div className="rounded-xl border border-border/60 bg-card p-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-gradient-to-br from-orange-500/8 to-transparent border border-orange-500/20 p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Flame className="w-3.5 h-3.5 text-orange-600" />
              <p className="text-[9px] uppercase tracking-widest font-bold text-orange-700 dark:text-orange-400">Streak risk</p>
            </div>
            <p className="text-[11px] leading-snug">
              {signal.streak?.today_done
                ? `Aaj ki streak safe ✅ Kal bhi ${signal.streak.current + 1}d ke liye 1 block chahiye.`
                : `Aaj mission miss ki toh ${signal.streak?.current ?? 0}-day streak reset. ${signal.prediction.delta.toFixed(1)}% percentile bhi girega.`}
            </p>
          </div>
          <div className="rounded-lg bg-gradient-to-br from-blue-500/8 to-transparent border border-blue-500/20 p-2.5">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <p className="text-[9px] uppercase tracking-widest font-bold text-blue-700 dark:text-blue-400">Rank chase</p>
            </div>
            <p className="text-[11px] leading-snug">
              {signal.prediction.trend === 'up'
                ? `Top ${(100 - signal.prediction.on_track_percentile).toFixed(1)}% mein aa raha hai — pace maintain kar.`
                : signal.prediction.trend === 'down'
                  ? `Rank slip ho raha — aaj 2 blocks compulsory.`
                  : `Consistent pace pe hai. 1 extra block = +${(signal.prediction.delta * 0.5).toFixed(1)}%.`}
            </p>
          </div>
        </div>
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

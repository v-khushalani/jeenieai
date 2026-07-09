/**
 * MissionHome — the new JEEnie home. One decision: START TODAY'S MISSION.
 * Auto-generates today's mission on first load; asks for prep_mode + daily minutes if unset.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Play, CheckCircle2, RefreshCw, Sparkles, ChevronRight, Clock, Loader2, Info, Compass, BookOpen, PlusCircle, TrendingUp, TrendingDown, Minus, Zap, Flame, Trophy } from 'lucide-react';
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
}

type BlockType = 'learn_practice' | 'revision' | 'weak_fix' | 'class_recap' | 'pyq' | 'mock';
interface MissionBlock {
  id: string;
  type: BlockType;
  title: string;
  subtitle: string;
  subject?: string;
  chapter_name?: string;
  minutes: number;
  question_count: number;
  why: string;
  action_href: string;
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
  { value: 'guided',    label: 'Full guidance', desc: 'I want JEEnie to decide everything for me' },
  { value: 'companion', label: 'Companion',     desc: 'I attend coaching / school — help me practice + revise' },
  { value: 'hybrid',    label: 'Hybrid',        desc: 'Self-study + some classes' },
  { value: 'dropper',   label: 'Dropper',       desc: 'Full-time preparation, 8+ hours/day' },
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

export default function MissionHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mission, setMission] = useState<DailyMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<DailyMission['prep_mode']>('guided');
  const [setupMinutes, setSetupMinutes] = useState<number>(120);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [greetingName, setGreetingName] = useState<string>('');
  const [prepMode, setPrepMode] = useState<DailyMission['prep_mode'] | null>(null);
  const [loggedToday, setLoggedToday] = useState<{ id: string; chapter_name: string | null; subject: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [signal, setSignal] = useState<CoachSignal | null>(null);

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

  const loadOrSetup = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, prep_mode, daily_study_minutes, prep_mode_set_at')
        .eq('id', user.id)
        .maybeSingle();

      setGreetingName(profile?.full_name?.split(' ')[0] ?? '');
      const mode = (profile?.prep_mode as DailyMission['prep_mode']) ?? 'guided';
      setPrepMode(mode);

      if (!profile?.prep_mode_set_at) {
        setSetupMode(mode);
        setSetupMinutes(profile?.daily_study_minutes ?? 120);
        setNeedsSetup(true);
        setLoading(false);
        return;
      }

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      // Check if a class is already logged today
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

      if (existing) {
        setMission(existing as unknown as DailyMission);
      } else {
        await generate(false);
      }

      // fire coach signal (non-blocking)
      supabase.functions.invoke('compute-coach-signal').then(({ data }) => {
        if (data && (data as CoachSignal).prediction) setSignal(data as CoachSignal);
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [user?.id, generate]);

  useEffect(() => { void loadOrSetup(); }, [loadOrSetup]);

  const saveSetup = async () => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        prep_mode: setupMode,
        daily_study_minutes: setupMinutes,
        prep_mode_set_at: new Date().toISOString(),
      })
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
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', mission.id);
    }
    navigate(block.action_href);
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const totalMinutes = mission?.total_minutes ?? 0;
  const doneCount = mission?.completed_blocks ?? 0;
  const totalCount = mission?.blocks?.length ?? 0;
  const allDone = totalCount > 0 && doneCount >= totalCount;

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="container mx-auto px-4 py-5 max-w-2xl space-y-5">
          {/* Greeting */}
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-2xl font-bold leading-tight">
              {greeting}{greetingName ? `, ${greetingName}` : ''} 👋
            </h1>
          </div>

          {/* Live prediction card */}
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
                      {signal.prediction.confidence === 'low' ? 'low conf.' : `confidence ${signal.prediction.confidence}`}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Miss today</p>
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



          {/* Companion / Hybrid: log today's class chip */}
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
                    <p className="text-[11px] text-muted-foreground">Log karo — JEEnie 10-Q recap test bana degi</p>
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
                  <div>
                    <p className="text-[11px] uppercase tracking-widest font-bold text-primary/80">Today's Mission</p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-3xl font-bold tabular-nums">{formatTime(totalMinutes)}</span>
                      <span className="text-xs text-muted-foreground">· {totalCount} blocks</span>
                    </div>
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
                    const isDone = idx < doneCount;
                    const isExpanded = expandedBlock === b.id;
                    return (
                      <div
                        key={b.id}
                        className={`rounded-xl border ${isDone ? 'opacity-60 border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-background/80'} transition-all`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedBlock(isExpanded ? null : b.id)}
                          className="w-full text-left p-3 flex items-center gap-3"
                        >
                          <div className="shrink-0">
                            {isDone ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                                {idx + 1}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`h-4 text-[9px] px-1.5 ${typeAccent[b.type]}`}>
                                {typeLabel[b.type]}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {b.minutes} min
                              </span>
                            </div>
                            <p className="text-sm font-semibold leading-tight mt-1 truncate">{b.title}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{b.subtitle}</p>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-border/50">
                            <p className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5 pt-2.5">
                              <Info className="w-3 h-3 mt-0.5 shrink-0 text-primary/70" />
                              <span><span className="font-semibold text-foreground">Why this? </span>{b.why}</span>
                            </p>
                            {!isDone && (
                              <Button size="sm" className="w-full" onClick={() => startBlock(b)}>
                                <Play className="w-3.5 h-3.5 mr-1.5" />
                                Start this block
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {allDone ? (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Aaj ki mission complete! 🔥</p>
                    <p className="text-[11px] text-muted-foreground">Kal fresh mission ready milegi.</p>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className="w-full h-12 text-sm font-bold rounded-xl"
                    onClick={() => mission.blocks[doneCount] && startBlock(mission.blocks[doneCount])}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    {doneCount === 0 ? "START TODAY'S MISSION" : `CONTINUE (${doneCount}/${totalCount})`}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Secondary — Explore */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/explore')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-border/60 hover:border-primary/40 transition"
            >
              <div className="flex items-center gap-2.5">
                <Compass className="w-4 h-4 text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-semibold leading-tight">Explore on my own</p>
                  <p className="text-[11px] text-muted-foreground">Practice, tests, notes, roadmap</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </main>

      {/* First-time setup */}
      <Dialog open={needsSetup} onOpenChange={(v) => { if (!v) setNeedsSetup(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>2 quick questions</DialogTitle>
            <DialogDescription>
              JEEnie decides your daily mission based on these — you can change them later in Settings.
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

function formatTime(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

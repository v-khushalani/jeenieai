/**
 * MissionChain — "The Challenge Engine".
 * Aaj ka rasta: 3–5 challenges, strictly one at a time. Complete karo → next
 * unlocks. Poori chain → Daily Vault. Upar weekly Contract strip.
 * Currency = JEEnie Points only (server-awarded via award_mission_points).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen, CheckCircle2, Coins, Flame, Loader2, Play, PlusCircle, RefreshCw, Zap,
} from 'lucide-react';
import LogClassSheet from '@/components/LogClassSheet';
import MissionCard, { TYPE_LABEL, type MissionBlock } from './MissionCard';
import RewardVault from './RewardVault';
import ContractStrip from './ContractStrip';

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
  { value: 'guided', label: 'Full guidance', desc: 'JEEnie decide karegi sab' },
  { value: 'companion', label: 'Companion', desc: 'Coaching / school + practice help' },
  { value: 'hybrid', label: 'Hybrid', desc: 'Self-study + kuch classes' },
  { value: 'dropper', label: 'Dropper', desc: 'Full-time prep, 8+ hrs/day' },
];

const MINUTE_CHOICES = [60, 90, 120, 150, 180, 240];

const formatTime = (m: number) => (m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);

export default function MissionChain() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [mission, setMission] = useState<DailyMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<DailyMission['prep_mode']>('guided');
  const [setupMinutes, setSetupMinutes] = useState(120);
  const [prepMode, setPrepMode] = useState<DailyMission['prep_mode'] | null>(null);
  const [loggedToday, setLoggedToday] = useState<{ id: string; chapter_name: string | null; subject: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [streak, setStreak] = useState<{ current: number; today_done: boolean } | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [sheetBlock, setSheetBlock] = useState<MissionBlock | null>(null);
  const claimedRef = useRef<Set<string>>(new Set());

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-mission', { body: { force } });
      if (error) throw error;
      const m = (data as { mission?: DailyMission } | null)?.mission;
      if (m) setMission(m);
    } catch {
      toast.error('Challenges generate nahi hue — thodi der mein retry karo');
    } finally {
      setGenerating(false);
    }
  }, []);

  const refreshMissionOnly = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data } = await supabase
      .from('daily_missions')
      .select('*')
      .eq('user_id', user.id)
      .eq('mission_date', today)
      .maybeSingle();
    if (data) setMission(data as unknown as DailyMission);
  }, [user?.id]);

  const loadPoints = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('total_points').eq('id', user.id).maybeSingle();
    setPoints((data as any)?.total_points ?? 0);
  }, [user?.id]);

  const loadOrSetup = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('prep_mode, daily_study_minutes, prep_mode_set_at, total_points')
        .eq('id', user.id)
        .maybeSingle();

      const mode = ((profile as any)?.prep_mode as DailyMission['prep_mode']) ?? 'guided';
      setPrepMode(mode);
      setPoints((profile as any)?.total_points ?? 0);

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
        existing.blocks.length > 0 &&
        (!(existing.blocks as any[])[0]?.progress || (existing.blocks as any[])[0]?.xp_reward == null);

      if (existing && !isLegacy) setMission(existing as unknown as DailyMission);
      else await generate(true);

      supabase.functions.invoke('compute-coach-signal').then(({ data }) => {
        const s = data as any;
        if (s?.streak) setStreak({ current: s.streak.current, today_done: s.streak.today_done });
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [user?.id, generate]);

  useEffect(() => { void loadOrSetup(); }, [loadOrSetup]);

  // Live sync — auto-tick as questions get solved
  useEffect(() => {
    if (!user?.id || !mission?.id) return;
    const channel = supabase
      .channel(`mission-chain-${mission.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_missions', filter: `id=eq.${mission.id}` },
        (payload) => setMission(payload.new as DailyMission))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, mission?.id]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void refreshMissionOnly(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshMissionOnly]);

  // Award JEEnie Points for every newly-completed challenge (server-guarded)
  useEffect(() => {
    if (!mission) return;
    const done = mission.blocks.filter(b => (b.progress?.status ?? 'pending') === 'done');
    const fresh = done.filter(b => !claimedRef.current.has(b.id));
    if (fresh.length === 0) return;
    fresh.forEach(b => claimedRef.current.add(b.id));
    (async () => {
      for (const b of fresh) {
        const { data } = await (supabase as any).rpc('award_mission_points', {
          p_mission_id: mission.id,
          p_block_id: b.id,
        });
        if (data?.ok && data.points > 0) {
          toast.success(`Challenge clear! +${data.points} JEEnie Points 🪙`);
          if (typeof data.total_points === 'number') setPoints(data.total_points);
        }
      }
      void loadPoints();
    })();
  }, [mission, loadPoints]);

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
    toast.success('Aaj ki challenge chain ready hai 🚀');
  };

  const startBlock = async (block: MissionBlock) => {
    if (!mission) return;
    if (mission.status === 'pending') {
      await supabase
        .from('daily_missions')
        .update({ status: 'in_progress', started_at: new Date().toISOString() } as any)
        .eq('id', mission.id);
    }
    navigate(block.action_href);
  };

  const blocks = mission?.blocks ?? [];
  const doneCount = useMemo(
    () => blocks.filter(b => (b.progress?.status ?? 'pending') === 'done').length,
    [blocks],
  );
  const total = blocks.length;
  const allDone = total > 0 && doneCount >= total;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const activeIndex = blocks.findIndex(b => (b.progress?.status ?? 'pending') !== 'done');
  const pointsToday = useMemo(
    () => blocks.reduce((s, b) => s + (b.xp_reward ?? 0), 0),
    [blocks],
  );

  return (
    <div className="space-y-3">
      {/* HUD */}
      {!loading && !needsSetup && (
        <div className="flex items-center gap-2 rounded-2xl border-2 border-border/60 bg-card px-3 py-2.5">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-tighter ${
            streak?.today_done ? 'bg-orange-500/15 text-orange-600' : 'bg-muted text-muted-foreground'
          }`}>
            <Flame className="w-3.5 h-3.5" />
            <span className="tabular-nums">{streak?.current ?? 0}d</span>
          </div>
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-black tabular-nums">
            <Coins className="w-3.5 h-3.5" />{points.toLocaleString('en-IN')}
          </div>
          <div className="flex-1 text-right">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black leading-none">Chain</p>
            <p className="text-sm font-black tabular-nums leading-tight mt-0.5">
              {doneCount}<span className="text-muted-foreground font-normal">/{total}</span>
            </p>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void generate(true)} disabled={generating}>
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}

      {!loading && !needsSetup && <ContractStrip />}

      {loading && (
        <Card className="border-dashed">
          <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Aaj ke challenges bana raha hu…</p>
          </CardContent>
        </Card>
      )}

      {!loading && mission && total > 0 && (
        <div className="space-y-3" data-testid="mission-chain">

          <JeenieCoachLine state={coachState} />

          {/* Near-win framing instead of raw counters */}
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] uppercase tracking-widest font-black text-primary">Aaj ka Mission</p>
            <p className="text-[11px] font-black text-foreground">
              {allDone
                ? 'Streak secure 🔥'
                : `${total - doneCount} step${total - doneCount > 1 ? 's' : ''} left to secure streak`}
            </p>
          </div>

          <ComboBar combo={combo} />

          {/* ONE action at a time */}
          {activeBlock && (
            <MissionCard
              key={activeBlock.id}
              block={activeBlock}
              index={activeIndex}
              total={total}
              state="active"
              elapsedSeconds={elapsed}
              onStart={() => void startBlock(activeBlock)}
              onInfo={() => setSheetBlock(activeBlock)}
            />
          )}

          <ChainDots total={total} doneCount={doneCount} activeIndex={activeIndex} />

          {doneCount > 0 && (
            <details className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                {doneCount} step{doneCount > 1 ? 's' : ''} done today
              </summary>
              <div className="mt-2 space-y-1.5">
                {blocks
                  .filter(b => (b.progress?.status ?? 'pending') === 'done')
                  .map(b => (
                    <div key={b.id} className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={3} />
                      <span className="truncate line-through">{b.title}</span>
                      <span className="ml-auto shrink-0 text-amber-600">+{b.xp_reward ?? 0}</span>
                    </div>
                  ))}
              </div>
            </details>
          )}

          <RewardVault unlocked={allDone} />

          {allDone && nextTeaser && (
            <p className="text-[11px] text-center font-bold text-primary">
              Kal: {nextTeaser} 👀
            </p>
          )}
        </div>
      )}


      {!loading && !needsSetup && !mission && (
        <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center space-y-3">
          <p className="text-sm font-black">Aaj ke challenges ready nahi hai</p>
          <p className="text-xs text-muted-foreground">
            5 questions solve karo — JEEnie tumhara pattern samajh ke chain bana degi.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button size="sm" onClick={() => navigate('/practice')}>
              <Play className="w-3.5 h-3.5 mr-1" /> Practice shuru karo
            </Button>
            <Button size="sm" variant="outline" disabled={generating} onClick={() => void generate(true)}>
              {generating ? 'Ban raha hai…' : 'Chain banao'}
            </Button>
          </div>
        </div>
      )}

      {/* Log class chip */}
      {!loading && !needsSetup && (prepMode === 'companion' || prepMode === 'hybrid') && (
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {loggedToday ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              : <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />}
            <span className="text-xs truncate">
              {loggedToday ? `Class logged: ${loggedToday.chapter_name ?? loggedToday.subject}` : 'Log aaj ki class'}
            </span>
          </div>
          <PlusCircle className="w-3.5 h-3.5 text-primary shrink-0" />
        </button>
      )}

      {/* Challenge details */}
      <Sheet open={!!sheetBlock} onOpenChange={(v) => { if (!v) setSheetBlock(null); }}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          {sheetBlock && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="text-base font-black">
                  {TYPE_LABEL[sheetBlock.type]} · {sheetBlock.title}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3 py-4 text-sm leading-snug">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground mb-1">Kyun</p>
                  <p className="text-foreground/90">{sheetBlock.why}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground mb-1">Target</p>
                  <p className="text-foreground/90">
                    {sheetBlock.goal || `${sheetBlock.passing_goal ?? Math.ceil(sheetBlock.question_count * 0.6)}/${sheetBlock.question_count} sahi = auto-tick`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground mb-1">Reward</p>
                  <p className="text-amber-600 font-bold">+{sheetBlock.xp_reward ?? 0} JEEnie Points</p>
                </div>
              </div>
              {(sheetBlock.progress?.status ?? 'pending') !== 'done' && (
                <Button
                  className="w-full h-11 rounded-2xl font-black uppercase"
                  onClick={() => { const b = sheetBlock; setSheetBlock(null); void startBlock(b); }}
                >
                  <Play className="w-4 h-4 mr-1.5" /> Challenge accept
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
              Isi se JEEnie roz ki challenge chain banayegi — Settings se badal sakte ho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Preparation kaise chal rahi hai?</p>
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
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Daily time</p>
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
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Build my challenges
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

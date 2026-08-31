/**
 * usePlannerMission — single source of truth for today's challenge chain.
 * Extracted from MissionChain so every bento tile reads the same live data.
 * No query/RPC behaviour changed: same tables, same edge functions, same RPCs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useCombo } from '@/components/planner/ComboBar';
import type { MissionBlock } from '@/components/planner/MissionCard';

export type PrepMode = 'guided' | 'companion' | 'dropper' | 'hybrid';

export interface DailyMission {
  id: string;
  mission_date: string;
  prep_mode: PrepMode;
  total_minutes: number;
  blocks: MissionBlock[];
  reasoning: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_blocks: number;
}

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export function usePlannerMission() {
  const { user } = useAuth();

  const [mission, setMission] = useState<DailyMission | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [prepMode, setPrepMode] = useState<PrepMode | null>(null);
  const [defaultMinutes, setDefaultMinutes] = useState(120);
  const [loggedToday, setLoggedToday] = useState<{ id: string; chapter_name: string | null; subject: string } | null>(null);
  const [streak, setStreak] = useState<{ current: number; today_done: boolean } | null>(null);
  const [points, setPoints] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const claimedRef = useRef<Set<string>>(new Set());
  const { combo, refreshCombo } = useCombo();

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
    const { data } = await supabase
      .from('daily_missions')
      .select('*')
      .eq('user_id', user.id)
      .eq('mission_date', istToday())
      .maybeSingle();
    if (data) setMission(data as unknown as DailyMission);
  }, [user?.id]);

  const loadPoints = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('total_points').eq('id', user.id).maybeSingle();
    setPoints((data as any)?.total_points ?? 0);
  }, [user?.id]);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('prep_mode, daily_study_minutes, prep_mode_set_at, total_points')
        .eq('id', user.id)
        .maybeSingle();

      const mode = ((profile as any)?.prep_mode as PrepMode) ?? 'guided';
      setPrepMode(mode);
      setDefaultMinutes((profile as any)?.daily_study_minutes ?? 120);
      setPoints((profile as any)?.total_points ?? 0);

      if (!(profile as any)?.prep_mode_set_at) {
        setNeedsSetup(true);
        setLoading(false);
        return;
      }

      const today = istToday();

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

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Live sync — auto-tick as questions get solved
  useEffect(() => {
    if (!user?.id || !mission?.id) return;
    const channel = supabase
      .channel(`planner-mission-${mission.id}`)
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

  const saveSetup = useCallback(async (mode: PrepMode, minutes: number) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        prep_mode: mode,
        daily_study_minutes: minutes,
        prep_mode_set_at: new Date().toISOString(),
      } as any)
      .eq('id', user.id);
    if (error) { toast.error(error.message); return; }
    setPrepMode(mode);
    setNeedsSetup(false);
    await generate(true);
    toast.success('Aaj ki challenge chain ready hai 🚀');
  }, [user?.id, generate]);

  const blocks = mission?.blocks ?? [];
  const doneCount = useMemo(
    () => blocks.filter(b => (b.progress?.status ?? 'pending') === 'done').length,
    [blocks],
  );
  const total = blocks.length;
  const allDone = total > 0 && doneCount >= total;
  const activeIndex = blocks.findIndex(b => (b.progress?.status ?? 'pending') !== 'done');
  const activeBlock = activeIndex >= 0 ? blocks[activeIndex] : null;

  const startBlock = useCallback(async (block: MissionBlock) => {
    if (!mission) return;
    if (mission.status === 'pending') {
      await supabase
        .from('daily_missions')
        .update({ status: 'in_progress', started_at: new Date().toISOString() } as any)
        .eq('id', mission.id);
    }
    try { window.localStorage.setItem(`jeenie_step_started_${block.id}`, String(Date.now())); } catch { /* ignore */ }
  }, [mission]);

  // Session timer for the active step (persists across reloads)
  const timerKey = activeBlock ? `jeenie_step_started_${activeBlock.id}` : null;
  useEffect(() => {
    if (!timerKey) { setElapsed(0); return; }
    const tick = () => {
      const raw = window.localStorage.getItem(timerKey);
      if (!raw) { setElapsed(0); return; }
      setElapsed(Math.max(0, Math.floor((Date.now() - Number(raw)) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timerKey]);

  useEffect(() => { void refreshCombo(); }, [mission?.completed_blocks, refreshCombo]);

  return {
    mission, blocks, loading, generating, needsSetup, setNeedsSetup,
    prepMode, defaultMinutes, loggedToday, streak, points, combo, elapsed,
    doneCount, total, allDone, activeIndex, activeBlock,
    generate, loadAll, refreshMissionOnly, saveSetup, startBlock,
  };
}

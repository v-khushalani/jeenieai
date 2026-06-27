import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import {
  buildMissionPayload,
  getPickedStartingChapter,
  MissionPayload,
} from '@/lib/missionEngine';
import { normalizeProgram } from '@/utils/programConfig';

export interface DailyMissionRow {
  id: string;
  user_id: string;
  mission_date: string;
  rule_id: string;
  title: string;
  subtitle: string | null;
  subject: string | null;
  chapter: string | null;
  topic: string | null;
  mode: string;
  target_count: number;
  progress_count: number;
  est_minutes: number;
  reward_points: number;
  status: 'pending' | 'in_progress' | 'completed';
  cta_route: string | null;
  reward_granted: boolean;
  reset_count?: number;
}

export interface UseTodaysMissionResult {
  mission: DailyMissionRow | null;
  needsColdStart: boolean;
  loading: boolean;
  justCompleted: boolean;
  acknowledgeCompletion: () => void;
  refresh: () => Promise<void>;
  regenerate: () => Promise<{ ok: boolean; reason?: string }>;
}

export function useTodaysMission(): UseTodaysMissionResult {
  const { user } = useAuth();
  const [mission, setMission] = useState<DailyMissionRow | null>(null);
  const [needsColdStart, setNeedsColdStart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [justCompleted, setJustCompleted] = useState(false);
  const prevStatusRef = useRef<string | null>(null);

  const setMissionTracked = useCallback((next: DailyMissionRow | null) => {
    if (next && prevStatusRef.current && prevStatusRef.current !== 'completed' && next.status === 'completed') {
      setJustCompleted(true);
    }
    prevStatusRef.current = next?.status ?? null;
    setMission(next);
  }, []);

  const acknowledgeCompletion = useCallback(() => setJustCompleted(false), []);

  const generate = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const { data: existing } = await supabase
        .from('daily_missions' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('mission_date', todayIST)
        .maybeSingle();
      // If a real (non-placeholder) row exists, use it.
      if (existing && (existing as any).rule_id !== '_pending_reset') {
        setMissionTracked(existing as any);
        setNeedsColdStart(false);
        setLoading(false);
        return;
      }

      const [profRes, attemptsRes] = await Promise.all([
        supabase.from('profiles').select('grade, target_exam').eq('id', user.id).maybeSingle(),
        supabase
          .from('question_attempts')
          .select('question_id, created_at, is_correct')
          .eq('user_id', user.id)
          .eq('mode', 'practice')
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const grade = (profRes.data as any)?.grade || 11;
      const examTrack = normalizeProgram((profRes.data as any)?.target_exam) as any;
      const attempts = attemptsRes.data || [];

      let chapQuery = supabase
        .from('chapters')
        .select('id, chapter_name, name, subject, chapter_number')
        .eq('is_active', true)
        .order('chapter_number', { ascending: true })
        .limit(300);
      if (grade) chapQuery = chapQuery.eq('class_level', grade);
      const { data: chapterPool } = await chapQuery;

      const qIds = Array.from(new Set(attempts.map((a) => a.question_id))).slice(0, 500);
      const questionMeta: Record<string, { subject: string | null; chapter: string | null }> = {};
      if (qIds.length > 0) {
        const { data: qs } = await supabase
          .from('questions_public')
          .select('id, subject, chapter')
          .in('id', qIds);
        (qs || []).forEach((q: any) => {
          questionMeta[q.id] = { subject: q.subject, chapter: q.chapter };
        });
      }

      const payload = buildMissionPayload({
        userId: user.id,
        attempts: attempts as any,
        questionMeta,
        chapterPool: (chapterPool || []) as any,
        totalAttempts: attempts.length,
        examTrack,
      });

      if (payload.rule_id === 'cold_start') {
        setNeedsColdStart(true);
        setMissionTracked(null);
        setLoading(false);
        return;
      }

      const full = payload as MissionPayload;
      const { data: created, error } = await supabase.rpc(
        'get_or_create_today_mission' as any,
        { p_payload: full as any }
      );
      if (error) throw error;
      setMissionTracked(created as any);
      setNeedsColdStart(false);
    } catch (e) {
      logger.error('useTodaysMission generate error', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, setMissionTracked]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const { data } = await supabase
      .from('daily_missions' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('mission_date', todayIST)
      .maybeSingle();
    if (data && (data as any).rule_id !== '_pending_reset') setMissionTracked(data as any);
  }, [user?.id, setMissionTracked]);

  const regenerate = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!user?.id) return { ok: false, reason: 'no_user' };
    const { data } = await supabase.rpc('reset_today_mission' as any);
    const result = (data as any) || { ok: true };
    if (result?.ok === false) return { ok: false, reason: result.reason };
    await generate();
    return { ok: true };
  }, [user?.id, generate]);

  useEffect(() => {
    if (user?.id) generate();
    if (user?.id) getPickedStartingChapter(user.id);
  }, [user?.id, generate]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`mission-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'daily_missions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as any;
          if (next?.rule_id === '_pending_reset') return;
          setMissionTracked(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, setMissionTracked]);

  return { mission, needsColdStart, loading, justCompleted, acknowledgeCompletion, refresh, regenerate };
}

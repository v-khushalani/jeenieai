import { useCallback, useEffect, useState } from 'react';
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
}

export interface UseTodaysMissionResult {
  mission: DailyMissionRow | null;
  needsColdStart: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  regenerate: () => Promise<void>;
}

export function useTodaysMission(): UseTodaysMissionResult {
  const { user } = useAuth();
  const [mission, setMission] = useState<DailyMissionRow | null>(null);
  const [needsColdStart, setNeedsColdStart] = useState(false);
  const [loading, setLoading] = useState(true);

  const generate = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // 1. Already exists?
      const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      const { data: existing } = await supabase
        .from('daily_missions' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('mission_date', todayIST)
        .maybeSingle();
      if (existing) {
        setMission(existing as any);
        setNeedsColdStart(false);
        setLoading(false);
        return;
      }

      // 2. Gather inputs and build payload
      const [profRes, attemptsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('grade, target_exam')
          .eq('id', user.id)
          .maybeSingle(),
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

      // Chapter pool for this exam track
      let chapQuery = supabase
        .from('chapters')
        .select('id, chapter_name, name, subject, chapter_number')
        .eq('is_active', true)
        .order('chapter_number', { ascending: true })
        .limit(300);
      if (grade) chapQuery = chapQuery.eq('class_level', grade);
      const { data: chapterPool } = await chapQuery;

      // Hydrate question metadata for attempted questions
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
        setMission(null);
        setLoading(false);
        return;
      }

      const full = payload as MissionPayload;
      const { data: created, error } = await supabase.rpc(
        'get_or_create_today_mission' as any,
        { p_payload: full as any }
      );
      if (error) throw error;
      setMission(created as any);
      setNeedsColdStart(false);
    } catch (e) {
      logger.error('useTodaysMission generate error', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

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
    if (data) setMission(data as any);
  }, [user?.id]);

  const regenerate = useCallback(async () => {
    if (!user?.id) return;
    await supabase.rpc('reset_today_mission' as any);
    await generate();
  }, [user?.id, generate]);

  useEffect(() => {
    if (user?.id) generate();
    // also flag cold-start state if no picked chapter yet
    if (user?.id) {
      const picked = getPickedStartingChapter(user.id);
      if (!picked) {
        // wait for generate() to settle; needsColdStart will be set there
      }
    }
  }, [user?.id, generate]);

  // realtime: progress trigger updates the row
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
          setMission(payload.new as any);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return { mission, needsColdStart, loading, refresh, regenerate };
}

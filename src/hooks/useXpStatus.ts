// src/hooks/useXpStatus.ts
// Single source of truth for the daily XP / streak loop.
// XP is stored server-side (profiles.daily_xp) via the award_xp RPC.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

export interface XpStatus {
  dailyXp: number;
  xpGoal: number;
  dailyGoal: number;
  streak: number;
  freezeAvailable: boolean;
  repairAvailable: boolean;
  repairStreakValue: number;
}

const XP_EVENT = 'jeenie:xp-updated';

/** Fire after any XP-earning action so every mounted XP widget refreshes. */
export function emitXpUpdate() {
  window.dispatchEvent(new CustomEvent(XP_EVENT));
}

const EMPTY: XpStatus = {
  dailyXp: 0,
  xpGoal: 150,
  dailyGoal: 15,
  streak: 0,
  freezeAvailable: false,
  repairAvailable: false,
  repairStreakValue: 0,
};

export function useXpStatus() {
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<XpStatus>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setStatus(EMPTY);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_xp_status' as never);
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      setStatus({
        dailyXp: Number(d.daily_xp ?? 0),
        xpGoal: Number(d.xp_goal ?? 150),
        dailyGoal: Number(d.daily_goal ?? 15),
        streak: Number(d.streak ?? 0),
        freezeAvailable: Boolean(d.freeze_available),
        repairAvailable: Boolean(d.repair_available),
        repairStreakValue: Number(d.repair_streak_value ?? 0),
      });
    } catch (e) {
      logger.error('get_xp_status failed', e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    window.addEventListener(XP_EVENT, handler);
    return () => window.removeEventListener(XP_EVENT, handler);
  }, [refresh]);

  return { ...status, loading, refresh };
}

/**
 * Awards XP for one answered question.
 * Combo = current consecutive-correct count (before this answer is counted).
 */
export async function awardXp(isCorrect: boolean, combo = 0) {
  try {
    const { data, error } = await supabase.rpc('award_xp' as never, {
      p_is_correct: isCorrect,
      p_combo: combo,
    } as never);
    if (error) throw error;
    emitXpUpdate();
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      xpAwarded: Number(d.xp_awarded ?? 0),
      dailyXp: Number(d.daily_xp ?? 0),
      xpGoal: Number(d.xp_goal ?? 150),
    };
  } catch (e) {
    logger.error('award_xp failed', e);
    return { xpAwarded: 0, dailyXp: 0, xpGoal: 150 };
  }
}

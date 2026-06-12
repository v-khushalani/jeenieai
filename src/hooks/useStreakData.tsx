// src/hooks/useStreakData.tsx
// Centralized hook for streak data across the app

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';

export const useStreakData = () => {
  const { user } = useAuth();
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    loadStreak();
    // No real-time subscription — useUserStats already handles profile changes
    // This avoids race conditions with concurrent streak RPCs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadStreak = async () => {
    if (!user?.id) return;

    try {
      // Check and reset streak via security definer RPC
      const { data: rpcResult } = await supabase.rpc('check_and_reset_streak', {
        p_user_id: user.id
      });

      const result = rpcResult as { streak?: number } | null;
      setStreak(result?.streak ?? 0);
    } catch (error) {
      logger.error('Error loading streak:', error);
      // Fallback: read directly
      try {
        const { data } = await supabase
          .from('profiles')
          .select('current_streak')
          .eq('id', user.id)
          .single();
        setStreak(data?.current_streak || 0);
      } catch {
        setStreak(0);
      }
    } finally {
      setLoading(false);
    }
  };

  return { streak, loading, refresh: loadStreak };
};

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { createDefaultFeatureFlagMap, mergeFeatureFlagRows } from '@/config/featureFlags';

interface FeatureFlag {
  flag_key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  category: string;
}

interface FeatureFlagContextType {
  flags: Record<string, FeatureFlag>;
  isEnabled: (flagKey: string) => boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextType | undefined>(undefined);

export const FeatureFlagProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [flags, setFlags] = useState<Record<string, FeatureFlag>>(createDefaultFeatureFlagMap());
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('flag_key, label, description, is_enabled, rollout_percentage, category');

      if (error) {
        // Avoid noisy console errors for public sessions where table access may be restricted.
        if (error.code === '401' || error.code === '403' || error.code === 'PGRST301') {
          logger.warn('Feature flags unavailable for current session. Falling back to default enabled behavior.');
          setFlags(createDefaultFeatureFlagMap());
        } else {
          logger.error('Failed to fetch feature flags:', error);
        }
        return;
      }

      setFlags(mergeFeatureFlagRows((data || []) as FeatureFlag[]));
    } catch (err) {
      logger.error('Feature flag fetch error:', err);
      setFlags(createDefaultFeatureFlagMap());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();

    // Subscribe to realtime changes so admin toggles reflect instantly
    const channel = supabase
      .channel('feature-flags-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'feature_flags' },
        () => {
          fetchFlags();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchFlags]);

  const isEnabled = useCallback(
    (flagKey: string): boolean => {
      const flag = flags[flagKey];
      if (!flag) return false;
      if (!flag.is_enabled) return false;
      // Rollout percentage (simple deterministic check)
      if (flag.rollout_percentage < 100) {
        // Use a simple hash of flagKey to decide — for per-user rollout you'd hash user_id
        const hash = flagKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 100;
        return hash < flag.rollout_percentage;
      }
      return true;
    },
    [flags]
  );

  return (
    <FeatureFlagContext.Provider value={{ flags, isEnabled, isLoading, refetch: fetchFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlag = (flagKey: string): boolean => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    return false;
  }
  return context.isEnabled(flagKey);
};

export const useFeatureFlags = () => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
};

export default FeatureFlagContext;

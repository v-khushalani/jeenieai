import safeLocalStorage from '@/utils/safeStorage';
// src/components/ProtectedRoute.tsx

import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { logger } from '@/utils/logger';
import { isGoalComplete, normalizeTargetExam } from '@/config/goalConfig';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const GOAL_CHECK_TIMEOUT = 5_000;

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [goalsChecked, setGoalsChecked] = useState(false);
  const [needsGoalSelection, setNeedsGoalSelection] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const checkGoals = async () => {
      if (!user) {
        setGoalsChecked(true);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      try {
        const getScopedKey = (base: string) => `${base}:${user.id}`;

        // ✅ FIX 1: Check recent goal save confirmation first (prevents race condition loops)
        const recentSaveConfirmed = sessionStorage.getItem(getScopedKey('_goalSaveConfirmed'));
        if (recentSaveConfirmed) {
          try {
            const saveInfo = JSON.parse(recentSaveConfirmed);
            // If save was less than 30 seconds ago, trust it
            if (Date.now() - saveInfo.timestamp < 30000) {
              logger.info('Goal save recently confirmed, skipping DB check');
              setNeedsGoalSelection(false);
              setGoalsChecked(true);
              return;
            }
          } catch (e) {
            logger.warn('Could not parse goal save confirmation');
          }
        }

        // ✅ FIX 2: Check sessionStorage completion flag first (bypass DB queries during sync)
        const goalSelectionComplete = sessionStorage.getItem(getScopedKey('goalSelectionComplete')) === 'true';
        const persistentGoalCompletion = safeLocalStorage.getItem(getScopedKey('goalSelectionComplete'));
        let hasPersistentGoalCompletion = false;
        if (persistentGoalCompletion) {
          try {
            const parsed = JSON.parse(persistentGoalCompletion);
            hasPersistentGoalCompletion = !!(parsed?.exam && parsed?.grade);
          } catch {
            hasPersistentGoalCompletion = false;
          }
        }

        if (goalSelectionComplete) {
          logger.info('Goal selection marked complete in sessionStorage, allowing access');
          setNeedsGoalSelection(false);
          setGoalsChecked(true);
          return;
        }

        if (hasPersistentGoalCompletion) {
          logger.info('Goal selection marked complete in localStorage, allowing access');
          setNeedsGoalSelection(false);
          setGoalsChecked(true);
          return;
        }

        // Check localStorage cache first
        const cachedGoals = safeLocalStorage.getItem(getScopedKey('userGoals'));
        if (cachedGoals) {
          try {
            const goals = JSON.parse(cachedGoals);
            if (goals?.goal && goals?.grade) {
              logger.info('Using cached user goals');
              setNeedsGoalSelection(false);
              setGoalsChecked(true);
              return;
            }
          } catch {
            // Invalid cached goals — fall through
          }
        }

        // Query profile with timeout
        const profilePromise = supabase
          .from('profiles')
          .select('target_exam, grade')
          .eq('id', user.id)
          .maybeSingle();

        const result = await Promise.race([
          profilePromise,
          new Promise<{ data: null; error: { message: string; code: string } }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: { message: 'Goal check timed out', code: 'TIMEOUT' } }), GOAL_CHECK_TIMEOUT)
          ),
        ]);

        const { data: profile, error } = result;

        if (error && error.code === 'TIMEOUT') {
          logger.warn('Goal check timed out — allowing access (trust client state if available)');
          // ✅ FIX 3: If timeout, check if we have any local indication of goal completion
          if (goalSelectionComplete || cachedGoals) {
            setNeedsGoalSelection(false);
          } else {
            // Without any local confirmation, allow access to avoid blocking the user
            // The route itself will handle redirects if needed
            setNeedsGoalSelection(false);
          }
        } else if (error && error.code !== 'PGRST116') {
          logger.error('Error checking goals:', error);
          setNeedsGoalSelection(false);
        } else if (error?.code === 'PGRST116' || !profile) {
          // No profile found - user is new and needs goal selection
          setNeedsGoalSelection(true);
        } else if (!isGoalComplete(profile)) {
          setNeedsGoalSelection(true);
        } else {
          // Profile is complete — cache for next visit
          const exam = normalizeTargetExam(profile?.target_exam);
          const userGoals = {
            grade: profile!.grade,
            goal: exam,
            subjects: [],
            name: '',
            daysRemaining: 0,
            createdAt: new Date().toISOString(),
          };
          safeLocalStorage.setItem(getScopedKey('userGoals'), JSON.stringify(userGoals));
          setNeedsGoalSelection(false);
        }
      } catch (error) {
        logger.error('Error checking goals:', error);
        setNeedsGoalSelection(false);
      }
      
      setGoalsChecked(true);
    };

    if (!isLoading && user) {
      checkGoals();
    } else if (!isLoading) {
      setGoalsChecked(true);
    }
  }, [user, isLoading]);

  if (isLoading || !goalsChecked) {
    return <LoadingScreen pageName={needsGoalSelection ? 'Goal Selection' : 'Dashboard'} />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (needsGoalSelection && location.pathname !== '/goal-selection') {
    return <Navigate to="/goal-selection" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

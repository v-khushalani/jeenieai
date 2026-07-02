import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ReferralService from '@/services/referralService';
import { User, Session } from '@supabase/supabase-js';
import { logger } from '@/utils/logger';
import { identifyUser, AnalyticsEvents } from '@/utils/analytics';
import { buildSubscriptionPatch, resolveSubscriptionTier, isSubscriptionActive } from '@/utils/subscriptionEntitlement';

import safeLocalStorage from '@/utils/safeStorage';
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPremium: boolean;
  isProPlus: boolean;
  subscriptionTier: 'free' | 'pro' | 'pro_plus';
  userRole: 'admin' | 'student' | 'super_admin' | 'educator' | null;
  refreshPremium: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (email: string, password: string, fullName: string, accountType?: 'student' | 'educator', phone?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
  updateProfile: (profileData: Record<string, unknown>) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isProPlus, setIsProPlus] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<'free' | 'pro' | 'pro_plus'>('free');
  const [userRole, setUserRole] = useState<'admin' | 'student' | 'super_admin' | 'educator' | null>(null);
  const listenerRef = React.useRef<{ subscription: { unsubscribe: () => void } } | null>(null);
  const authStateSeqRef = React.useRef(0);
  const isMountedRef = React.useRef(true);

  // Check premium status and user role
  const checkPremiumStatus = async (userId: string, requestSeq: number) => {
    try {
      const isStale = () => requestSeq !== authStateSeqRef.current || !isMountedRef.current;

      // Get premium status from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium, subscription_end_date, subscription_plan, subscription_status, subscription_tier')
        .eq('id', userId)
        .single();

      if (isStale()) return;

      // Resolve tier from either the new tier fields or the legacy premium/date fields.
      const resolvedTier = resolveSubscriptionTier(profile);

      if (isStale()) return;

      setSubscriptionTier(resolvedTier);
      setIsPremium(resolvedTier !== 'free');
      setIsProPlus(resolvedTier === 'pro_plus');

      
      // Get all roles for this user — pick highest-privilege one (a user may have multiple rows).
      const { data: roleRows, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      let resolvedRole: 'admin' | 'student' | 'super_admin' | 'educator' = 'student';
      const priority: Record<string, number> = { super_admin: 4, admin: 3, educator: 2, student: 1 };
      if (roleRows && roleRows.length > 0) {
        const best = roleRows
          .map((r) => r.role as 'admin' | 'student' | 'super_admin' | 'educator')
          .sort((a, b) => (priority[b] ?? 0) - (priority[a] ?? 0))[0];
        if (best) resolvedRole = best;
      } else if (roleError) {
        // Fallback: check user_metadata.account_type if user_roles query fails (e.g. RLS)
        logger.warn('user_roles query failed, falling back to metadata:', roleError.message);
        const metaType = (await supabase.auth.getUser()).data?.user?.user_metadata?.account_type;
        if (metaType === 'educator') resolvedRole = 'educator';
      }

      if (isStale()) return;

      setUserRole(resolvedRole);
      logger.log('✅ Premium status:', resolvedTier !== 'free' ? 'PREMIUM' : 'FREE');
      logger.log('✅ Subscription tier:', resolvedTier);
      logger.log('✅ User role:', resolvedRole);

      // Fire-and-forget: warm the planner cache in the background so
      // /ai-planner opens instantly on first visit. Skips on 2G / saveData.
      try {
        const { prefetch } = await import('@/lib/prefetchManager');
        const { readPlannerCache, writePlannerCache, isFresh } = await import('@/lib/plannerCache');
        prefetch(`planner:${userId}`, async () => {
          const cached = readPlannerCache(userId);
          if (cached && isFresh(cached.ageMs)) return;
          const [{ loadPlannerData }, { normalizeExam }] = await Promise.all([
            import('@/components/AIStudyPlanner'),
            import('@/lib/roadmapEngine'),
          ]);
          const { data: prof } = await supabase
            .from('my_profile' as any).select('*').maybeSingle();
          const exam = normalizeExam((prof as any)?.target_exam || 'JEE');
          const data = await loadPlannerData(userId, exam as any);
          writePlannerCache(userId, { profile: prof, targetExam: exam, planner: data, completedHashes: [] });
        }, { delayMs: 1500 });
      } catch (e) {
        logger.warn('planner prefetch skipped', e);
      }
    } catch (error) {
      if (!isMountedRef.current || requestSeq !== authStateSeqRef.current) return;
      logger.error('❌ Premium check error:', error);
      setIsPremium(false);
      setIsProPlus(false);
      setSubscriptionTier('free');
      setUserRole('student');
    }
  };

  useEffect(() => {
    let mounted = true;
    isMountedRef.current = true;
    logger.log("🚀 Setting up Supabase Auth listener (runs once)");
  
    const updateAuthState = async (session: Session | null) => {
      const requestSeq = ++authStateSeqRef.current;
      if (!mounted || !isMountedRef.current) return;
      setSession(session);
      setUser(session?.user ?? null);
      
      // Check premium status when user logs in
      if (session?.user) {
        await checkPremiumStatus(session.user.id, requestSeq);
      } else {
        if (requestSeq !== authStateSeqRef.current || !isMountedRef.current) return;
        setIsPremium(false);
        setIsProPlus(false);
        setSubscriptionTier('free');
        setUserRole(null);
      }
      
      if (requestSeq === authStateSeqRef.current && isMountedRef.current) {
        setIsLoading(false);
      }
    };
  
    // 1️⃣ Fetch initial session FIRST
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) logger.error("❌ Initial session error:", error);
      logger.log("🔍 Initial session check:", session?.user?.id || "none");
      updateAuthState(session);
    });
  
    // 2️⃣ Remove any existing listener before creating a new one
    if (listenerRef.current) {
      logger.log("🧹 Removing old auth listener...");
      listenerRef.current.subscription.unsubscribe();
    }
  
    // 3️⃣ Listen for subsequent auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        logger.info("Auth event", { event, userId: session?.user?.id || "none" });
        updateAuthState(session);
  
        if (event === "SIGNED_IN" && session?.user) {
          setTimeout(() => createUserProfileIfNeeded(session.user), 0);
        }

        // Handle password recovery — redirect to reset page if not already there
        if (event === "PASSWORD_RECOVERY" && session) {
          logger.info("Password recovery event detected, redirecting to reset page");
          if (!window.location.pathname.includes('/reset-password')) {
            window.location.href = '/reset-password';
          }
        }
  
        if (event === "SIGNED_OUT") {
          setUser(null);
          setSession(null);
          setIsPremium(false);
          setIsProPlus(false);
          setSubscriptionTier('free');
          setUserRole(null);
        }
      }
    );
  
    listenerRef.current = listener; // ✅ store listener reference
  
    return () => {
      mounted = false;
      isMountedRef.current = false;
      if (listenerRef.current) {
        logger.info("Cleaning up Supabase listener on unmount");
        listenerRef.current.subscription.unsubscribe();
        listenerRef.current = null;
      }
    };
  }, []);

  
  const createUserProfileIfNeeded = async (user: User) => {
    try {
      logger.info('Checking profile for user', { userId: user.id });
      const { error } = await supabase.functions.invoke('ensure-user-profile');

      if (error) {
        logger.error('Profile creation failed:', error);
      } else {
        logger.info('Profile ensured successfully');
      }
    } catch (error) {
      logger.error('Profile check/creation error:', error);
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      setIsLoading(true);
      logger.log('🚀 Starting email sign in...');

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error('❌ Email sign in error:', error);
        setIsLoading(false);
        
        // ✅ SECURITY: Normalize error messages to prevent user enumeration
        let displayError = error.message;
        if (displayError.toLowerCase().includes('invalid') || 
            displayError.toLowerCase().includes('credentials') ||
            displayError.toLowerCase().includes('login') ||
            displayError.toLowerCase().includes('user')) {
          displayError = 'Invalid email or password. Please try again.';
        } else if (displayError.toLowerCase().includes('email not confirmed')) {
          displayError = 'Please confirm your email before signing in. Check your inbox for the verification link.';
        } else if (displayError.toLowerCase().includes('rate limit') || 
                   displayError.toLowerCase().includes('too many')) {
          displayError = 'Too many login attempts. Please try again in a few minutes.';
        }
        
        return { error: displayError };
      }

      logger.log('✅ Email sign in successful');
      if (data.user) {
        identifyUser(data.user.id, { email: data.user.email });
        AnalyticsEvents.signIn('email');
      }
      setIsLoading(false);
      return {};
    } catch (error: any) {
      logger.error('❌ Sign-in error:', error);
      setIsLoading(false);
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string, accountType?: 'student' | 'educator', phone?: string): Promise<{ error?: string }> => {
    try {
      setIsLoading(true);
      logger.log('🚀 Starting email sign up...');

      const finalName = accountType === 'educator' ? `${fullName} (Educator)` : fullName;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: finalName,
            account_type: accountType || 'student',
            phone: phone || undefined,
          },
        },
      });

      if (error) {
        logger.error('❌ Email sign up error:', error);
        setIsLoading(false);
        
        // ✅ SECURITY: Normalize error messages to prevent user enumeration
        let displayError = error.message;
        if (displayError.toLowerCase().includes('already exists') || 
            displayError.toLowerCase().includes('duplicate') ||
            displayError.toLowerCase().includes('user already')) {
          displayError = 'This email is already registered. Please sign in or use a different email.';
        } else if (displayError.toLowerCase().includes('rate limit') || 
                   displayError.toLowerCase().includes('too many')) {
          displayError = 'Too many signup attempts. Try again later or use Google Sign-In.';
        } else if (displayError.toLowerCase().includes('invalid') || 
                   displayError.toLowerCase().includes('password')) {
          displayError = 'Password does not meet security requirements.';
        }
        
        return { error: displayError };
      }

      // Profile is auto-created by the handle_new_user database trigger

      logger.log('✅ Email sign up successful');
      if (data.user) {
        identifyUser(data.user.id, { email: data.user.email });
        AnalyticsEvents.signUp('email');

        // Process pending referral (stored by Signup page from ?ref= URL param)
        const pendingRef = safeLocalStorage.getItem('jeenie_pending_ref');
        if (pendingRef) {
          try {
            await ReferralService.processReferralOnSignup(data.user.id, pendingRef);
            safeLocalStorage.removeItem('jeenie_pending_ref');
            logger.log('✅ Referral processed for new user', data.user.id);
          } catch (refErr) {
            // Non-fatal — don't block signup if referral fails
            logger.warn('⚠️ Referral processing failed (non-fatal):', refErr);
            safeLocalStorage.removeItem('jeenie_pending_ref');
          }
        }
      }
      setIsLoading(false);
      return {};
    } catch (error: any) {
      logger.error('❌ Sign-up error:', error);
      setIsLoading(false);
      return { error: 'An unexpected error occurred. Please try again.' };
    }
  };

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    try {
      logger.log('🚀 Sending password reset email...');

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        logger.error('❌ Password reset error:', error);
        return { error: error.message };
      }

      logger.log('✅ Password reset email sent');
      return {};
    } catch (error: any) {
      logger.error('❌ Reset password error:', error);
      return { error: error.message || 'Failed to send reset email' };
    }
  };

  const updatePassword = async (newPassword: string): Promise<{ error?: string }> => {
    try {
      logger.log('🚀 Updating password...');

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        logger.error('❌ Update password error:', error);
        return { error: error.message };
      }

      logger.log('✅ Password updated successfully');
      return {};
    } catch (error: any) {
      logger.error('❌ Update password error:', error);
      return { error: error.message || 'Failed to update password' };
    }
  };

  const signOut = async (): Promise<void> => {
    setIsLoading(true);
    logger.info('Signing out...');

    const currentUserId = user?.id;

    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error('Sign out error:', error);
    }

    // Clear localStorage
    safeLocalStorage.removeItem('userGoals');
    safeLocalStorage.removeItem('goalSelectionComplete');
    if (currentUserId) {
      safeLocalStorage.removeItem(`userGoals:${currentUserId}`);
      safeLocalStorage.removeItem(`goalSelectionComplete:${currentUserId}`);
      sessionStorage.removeItem(`goalSelectionComplete:${currentUserId}`);
      sessionStorage.removeItem(`_goalSaveConfirmed:${currentUserId}`);
    }
    sessionStorage.removeItem('goalSelectionComplete');
    sessionStorage.removeItem('_goalSaveConfirmed');
    safeLocalStorage.removeItem('studyProgress');

    // Immediately clear auth state to update UI
    setUser(null);
    setSession(null);
    setUserRole(null);

    AnalyticsEvents.signOut();
    setIsLoading(false);
    logger.info('Signed out successfully');
  };

  const updateProfile = async (profileData: Record<string, unknown>): Promise<{ error?: string }> => {
    if (!user) return { error: 'No user found' };
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update(profileData as any)
        .eq('id', user.id);
      
      if (error) {
        logger.error('Profile update error:', error);
        return { error: error.message };
      }
      
      return {};
    } catch (error: any) {
      logger.error('Profile update error:', error);
      return { error: error.message || 'Failed to update profile' };
    }
  };

  const refreshPremium = async () => {
    if (user) {
      const requestSeq = ++authStateSeqRef.current;
      await checkPremiumStatus(user.id, requestSeq);
    }
  };

  const value = {
    user,
    session,
    isAuthenticated: !!user,
    isLoading,
    isPremium,
    isProPlus,
    subscriptionTier,
    userRole,
    refreshPremium,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

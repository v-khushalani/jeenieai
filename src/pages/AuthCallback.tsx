import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { logger } from '@/utils/logger';
import { isGoalComplete } from '@/config/goalConfig';
import SEOHead from '@/components/SEOHead';

const AuthCallback = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  const ensureUserProfile = async () => {
    const { error } = await supabase.functions.invoke('ensure-user-profile');
    if (error) {
      logger.error('Failed to ensure profile in auth callback:', error);
    }
  };

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe: () => void } | null = null;

    const url = new URL(window.location.href);
    const errorParam = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (errorParam) {
      logger.error('Auth error from URL:', errorParam, errorDescription);
      navigate(`/login?error=${encodeURIComponent(errorDescription || errorParam)}`, { replace: true });
      return;
    }

    // PKCE flow: exchange code for session
    const code = url.searchParams.get('code');
    if (code) {
      logger.log('PKCE code detected, exchanging for session...');
      supabase.auth.exchangeCodeForSession(code).catch((err) => {
        logger.error('Code exchange failed:', err);
      });
      // Session will be picked up by the listener below
    }

    // Primary: listen for auth state change
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.info('AuthCallback onAuthStateChange:', event);

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session?.user) {
        if (timeoutId) clearTimeout(timeoutId);
        await ensureUserProfile();
        await checkProfileAndRedirect(session.user.id);
      }

      if (event === 'PASSWORD_RECOVERY' && session) {
        if (timeoutId) clearTimeout(timeoutId);
        navigate('/reset-password', { replace: true });
      }
    });
    subscription = data.subscription;

    // Timeout fallback
    timeoutId = setTimeout(async () => {
      // One last try
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await ensureUserProfile();
        await checkProfileAndRedirect(data.session.user.id);
      } else {
        logger.error('Auth callback timeout — no session after 10s');
        navigate('/login?error=timeout', { replace: true });
      }
    }, 10000);

    async function checkProfileAndRedirect(userId: string) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('target_exam, grade')
          .eq('id', userId)
          .single();

        if (error && error.code === 'PGRST116') {
          navigate('/goal-selection', { replace: true });
          return;
        }

        if (isGoalComplete(profile || {})) {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/goal-selection', { replace: true });
        }
      } catch (err) {
        logger.error('Profile check error:', err);
        navigate('/goal-selection', { replace: true });
      }
    }

    return () => {
      if (subscription) subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate]);

  return <LoadingScreen pageName="Sign In" message="Verifying your account and setting things up." />;
};

export default AuthCallback;

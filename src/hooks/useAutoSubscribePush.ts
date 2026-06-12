import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from './usePushNotifications';
import { logger } from '@/utils/logger';

/**
 * Automatically subscribes the user to push notifications on login.
 * Requests permission once per session — if granted, subscribes silently.
 */
export function useAutoSubscribePush() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe } = usePushNotifications();
  const attemptedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || !isSupported || isSubscribed || attemptedUserId.current === user.id) return;
    if (permission === 'denied') return; // respect previous denial

    attemptedUserId.current = user.id;

    // Small delay so the page loads first
    const timer = setTimeout(async () => {
      try {
        const success = await subscribe();
        if (success) {
          logger.info('Auto push subscription successful');
        }
      } catch (err) {
        logger.error('Auto push subscription failed:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [user?.id, isSupported, isSubscribed, permission, subscribe]);
}

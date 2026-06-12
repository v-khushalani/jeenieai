/**
 * Analytics Utility
 * Lightweight event tracking for user behavior analytics.
 * Currently logs events; swap in Mixpanel/Amplitude when ready.
 *
 * Usage:
 *   import { trackEvent, identifyUser } from '@/utils/analytics';
 *   trackEvent('quiz_submitted', { score: 8, topic: 'Organic' });
 */

import { logger } from '@/utils/logger';
import { analytics } from '@/lib/analytics';

/**
 * Track a user event with optional properties.
 */
export const trackEvent = async (
  eventName: string,
  properties?: Record<string, any>
): Promise<void> => {
  const enriched = {
    ...properties,
    timestamp: new Date().toISOString(),
    url: window.location.pathname,
    screen: `${window.innerWidth}x${window.innerHeight}`,
  };

  // Always log in dev
  logger.info(`[Analytics] ${eventName}`, enriched);

  // Delegate to shared analytics service (GA + Mixpanel)
  try {
    analytics.event(eventName, enriched);
  } catch {
    // Silently ignore analytics failures
  }
};

/**
 * Identify the current user for analytics.
 */
export const identifyUser = async (
  userId: string,
  traits?: Record<string, any>
): Promise<void> => {
  logger.info('[Analytics] identify', { userId, ...traits });
  try {
    analytics.identify(userId, traits);
  } catch {
    // Silently ignore
  }
};

/**
 * Track page views.
 */
export const trackPageView = (pageName: string): void => {
  trackEvent('page_view', { page: pageName });
  try {
    analytics.pageView(pageName);
  } catch {
    // Ignore analytics errors
  }
};

// Pre-defined event helpers
export const AnalyticsEvents = {
  // Auth
  signUp: (method: string) => trackEvent('sign_up', { method }),
  signIn: (method: string) => trackEvent('sign_in', { method }),
  signOut: () => trackEvent('sign_out'),

  // Study
  quizStarted: (topic: string, difficulty: string) =>
    trackEvent('quiz_started', { topic, difficulty }),
  quizCompleted: (props: {
    topic: string;
    score: number;
    total: number;
    accuracy: number;
    timeSpent: number;
    difficulty: string;
  }) => trackEvent('quiz_completed', props),
  questionAnswered: (props: {
    topic: string;
    isCorrect: boolean;
    timeSpent: number;
    difficulty: string;
  }) => trackEvent('question_answered', props),

  // Gamification
  streakUpdated: (days: number) => trackEvent('streak_updated', { days }),
  badgeEarned: (badge: string) => trackEvent('badge_earned', { badge }),
  levelUp: (level: string, points: number) =>
    trackEvent('level_up', { level, points }),
  leaderboardViewed: (filter: string) =>
    trackEvent('leaderboard_viewed', { filter }),

  // Engagement
  aiDoubtAsked: (subject: string) =>
    trackEvent('ai_doubt_asked', { subject }),
  studyPlanGenerated: () => trackEvent('study_plan_generated'),
  referralShared: () => trackEvent('referral_shared'),

  // Subscription
  subscriptionViewed: () => trackEvent('subscription_viewed'),
  subscriptionStarted: (plan: string, price: number) =>
    trackEvent('subscription_started', { plan, price }),
};

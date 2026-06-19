import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from '@/lib/analytics';

const SITE_NAME = 'JEEnie AI';
const DEFAULT_TITLE = 'JEEnie AI – AI-Powered JEE, NEET & Foundation Prep';

/**
 * Maps a pathname to a friendly tab title.
 * Order matters: more specific patterns first.
 */
const getTitleForPath = (pathname: string): string => {
  const path = pathname.toLowerCase();

  // Exact matches
  const exact: Record<string, string> = {
    '/': DEFAULT_TITLE,
    '/login': 'Login',
    '/signup': 'Create Account',
    '/forgot-password': 'Forgot Password',
    '/reset-password': 'Reset Password',
    '/auth/callback': 'Signing you in…',
    '/why-us': 'Why JEEnie',
    '/about': 'About',
    '/faq': 'FAQ',
    '/privacy-policy': 'Privacy Policy',
    '/terms-of-service': 'Terms of Service',
    '/refund-policy': 'Refund Policy',
    '/install': 'Install App',
    '/goal-selection': 'Choose Your Goal',
    '/dashboard': 'Dashboard',
    '/study-now': 'Study Now',
    '/practice': 'Practice',
    '/tests': 'Tests',
    '/test-history': 'Test History',
    '/test-results': 'Test Results',
    '/test-attempt': 'Test in Progress',
    '/analytics': 'Analytics',
    '/ai-planner': 'AI Study Planner',
    '/profile': 'Profile',
    '/settings': 'Settings',
    '/badges': 'Badges',
    '/subscription-plans': 'Subscription Plans',
    '/subscription': 'Subscription Plans',
    '/pro-plus-library': 'Pro+ Library',
    '/group-test/create': 'Create Group Test',
    '/group-test/join': 'Join Group Test',
  };

  if (exact[path]) return exact[path];

  // Pattern matches
  if (path.startsWith('/test-attempt/')) return 'Test in Progress';
  if (path.startsWith('/test-results/')) return 'Test Results';
  if (path.startsWith('/group-test/') && path.endsWith('/leaderboard')) return 'Group Test Leaderboard';

  // Admin
  if (path.startsWith('/admin')) {
    const adminMap: Record<string, string> = {
      '/admin': 'Admin Overview',
      '/admin/analytics': 'Admin · Analytics',
      '/admin/users': 'Admin · Users',
      '/admin/reports': 'Admin · Reports',
      '/admin/notifications': 'Admin · Notifications',
      '/admin/chapters': 'Admin · Chapters & Topics',
      '/admin/setup': 'Admin · Exams & Batches',
      '/admin/educator-content': 'Admin · Educator Review',
      '/admin/pdf-extract': 'Admin · PDF Extractor',
      '/admin/review-queue': 'Admin · Review Queue',
      '/admin/auto-assign': 'Admin · Auto-Assign',
      '/admin/feature-flags': 'Admin · Feature Flags',
    };
    return adminMap[path] || 'Admin';
  }

  // Educator
  if (path.startsWith('/educator')) return 'Educator Portal';

  return DEFAULT_TITLE;
};

/**
 * Tracks page views and sets the browser tab title on every route change.
 * Place inside <BrowserRouter> in App.tsx.
 */
const RouteTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const pageTitle = getTitleForPath(location.pathname);
    const fullTitle =
      pageTitle === DEFAULT_TITLE ? DEFAULT_TITLE : `${pageTitle} | ${SITE_NAME}`;
    document.title = fullTitle;

    analytics.pageView(location.pathname, fullTitle);
  }, [location.pathname]);

  return null;
};

export default RouteTracker;

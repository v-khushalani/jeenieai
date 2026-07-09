import { useEffect, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { FeatureFlagProvider } from "@/contexts/FeatureFlagContext";
import LoadingScreen from "@/components/ui/LoadingScreen";
import { GlobalErrorBoundary } from "@/components/ErrorBoundary";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileNavigation from "@/components/mobile/MobileNavigation";
import { LiveNotificationBanner } from "@/components/LiveNotificationBanner";
import { useFeatureFlag } from "@/contexts/FeatureFlagContext";
import { useAutoSubscribePush } from "@/hooks/useAutoSubscribePush";
import { OfflineBanner } from "@/components/ui/StatusStates";
import { testsAPI } from "@/services/api";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Eagerly loaded pages (critical for initial load)
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AuthCallback from '@/pages/AuthCallback';
import WhyUsPage from "./pages/WhyUsPage";

// Lazy loaded pages (split into separate bundles)
const StudyNowPage = lazyWithRetry(() => import("./pages/StudyNowPage"), "StudyNowPage");
const PracticePage = lazyWithRetry(() => import("./pages/PracticePage"), "PracticePage");
const TestPage = lazyWithRetry(() => import("@/pages/TestPage"), "TestPage");
const TestAttemptPage = lazyWithRetry(() => import("./pages/TestAttemptPage"), "TestAttemptPage");
const TestHistoryPage = lazyWithRetry(() => import("./pages/TestHistoryPage"), "TestHistoryPage");
const TestResultsPage = lazyWithRetry(() => import("./pages/TestResultsPage"), "TestResultsPage");
const Settings = lazyWithRetry(() => import("./pages/Settings"), "Settings");
const Profile = lazyWithRetry(() => import("./pages/Profile"), "Profile");
const NotFound = lazyWithRetry(() => import("./pages/NotFound"), "NotFound");
const GoalSelectionPage = lazyWithRetry(() => import('@/pages/GoalSelectionPage'), "GoalSelectionPage");


const AIStudyPlannerPage = lazyWithRetry(() => import('./pages/AIStudyPlannerPage'), "AIStudyPlannerPage");
const EnhancedDashboard = lazyWithRetry(() => import("./pages/EnhancedDashboard"), "EnhancedDashboard");

const ClassRecapTest = lazyWithRetry(() => import("./pages/ClassRecapTest"), "ClassRecapTest");
const AnalyticsPage = lazyWithRetry(() => import("@/pages/AnalyticsPage"), "AnalyticsPage");
const AdminDashboard = lazyWithRetry(() => import("@/pages/AdminDashboard"), "AdminDashboard");
const EducatorDashboard = lazyWithRetry(() => import("@/pages/EducatorDashboard"), "EducatorDashboard");
const SubscriptionPlans = lazyWithRetry(() => import('@/pages/SubscriptionPlans'), "SubscriptionPlans");
const ProPlusLibraryPage = lazyWithRetry(() => import('@/pages/ProPlusLibraryPage'), "ProPlusLibraryPage");

const BadgesPage = lazyWithRetry(() => import('@/pages/BadgesPage'), "BadgesPage");
const CreateGroupTestPage = lazyWithRetry(() => import('@/pages/CreateGroupTestPage'), "CreateGroupTestPage");
const JoinGroupTestPage = lazyWithRetry(() => import('@/pages/JoinGroupTestPage'), "JoinGroupTestPage");
const GroupTestLeaderboard = lazyWithRetry(() => import('@/pages/GroupTestLeaderboard'), "GroupTestLeaderboard");
const PrivacyPolicy = lazyWithRetry(() => import('@/pages/PrivacyPolicy'), "PrivacyPolicy");
const TermsOfService = lazyWithRetry(() => import('@/pages/TermsOfService'), "TermsOfService");
const RefundPolicy = lazyWithRetry(() => import('@/pages/RefundPolicy'), "RefundPolicy");
const InstallApp = lazyWithRetry(() => import('@/pages/InstallApp'), "InstallApp");
const FAQPage = lazyWithRetry(() => import('@/pages/FAQPage'), "FAQPage");
const WrappedPage = lazyWithRetry(() => import('@/pages/WrappedPage'), "WrappedPage");
const BattlePage = lazyWithRetry(() => import('@/pages/BattlePage'), "BattlePage");
const SharePage = lazyWithRetry(() => import('@/pages/SharePage'), "SharePage");

// Components
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";
import EducatorRoute from "@/components/EducatorRoute";
import FloatingAIButton from "@/components/FloatingAIButton";
import RouteTracker from "@/components/RouteTracker";
import FeatureGate from "@/components/FeatureGate";
import PremiumGate from "@/components/PremiumGate";
import ProPlusGate from "@/components/ProPlusGate";
import BadgeUnlockCelebration from "@/components/gamification/BadgeUnlockCelebration";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const RouteAwareLoadingScreen = () => {
  const location = useLocation();
  const path = location.pathname;

  const pageName = path === '/' ? 'Home' :
    path.startsWith('/study-now') ? 'Study Now' :
    path.startsWith('/practice') ? 'Practice' :
    path.startsWith('/tests') ? 'Tests' :
    path.startsWith('/goal-selection') ? 'Goal Selection' :
    path.startsWith('/test-history') ? 'Test History' :
    path.startsWith('/dashboard') ? 'Dashboard' :
    path.startsWith('/profile') ? 'Profile' :
    'JEEnie';

  return <LoadingScreen pageName={pageName} />;
};

// Dashboard Router Component — students see the elegant EnhancedDashboard; admin/educator redirect
const DashboardRouter = () => {
  const { userRole, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      if (userRole === 'admin' || userRole === 'super_admin') {
        navigate('/admin', { replace: true });
      } else if (userRole === 'educator') {
        navigate('/educator', { replace: true });
      }
    }
  }, [userRole, isLoading, navigate]);

  if (isLoading) {
    return <LoadingScreen pageName="Dashboard" />;
  }

  return <EnhancedDashboard />;
};

// Auto push subscription component
const AutoPushSubscriber = () => {
  useAutoSubscribePush();
  return null;
};

const PendingTestSyncWorker = () => {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const syncPending = () => {
      void testsAPI.flushPendingTestSyncs(user.id);
    };

    syncPending();
    window.addEventListener('online', syncPending);

    return () => {
      window.removeEventListener('online', syncPending);
    };
  }, [isAuthenticated, user?.id]);

  return null;
};

// Mobile bottom nav - only renders on mobile for authenticated users, hidden on admin/educator routes
const MobileBottomNav = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const hiddenPaths = ['/admin', '/educator', '/test-attempt', '/goal-selection', '/auth/callback'];
  const shouldHide = hiddenPaths.some(p => location.pathname.startsWith(p));

  if (!isMobile || shouldHide || !isAuthenticated) return null;

  return <MobileNavigation />;
};

const FloatingAIEntry = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const enabled = useFeatureFlag('ai_doubt_solver');
  if (!enabled) return null;
  if (location.pathname.startsWith('/educator')) return null;
  if (location.pathname.startsWith('/battle')) return null;
  // Hide on landing only when signed-out. Authenticated users see dashboard at "/".
  if (location.pathname === '/' && !isAuthenticated) return null;
  return <FloatingAIButton />;
};

const FeatureFlaggedLiveBanner = () => {
  const enabled = useFeatureFlag('live_notifications');
  if (!enabled) return null;
  return <LiveNotificationBanner />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <FeatureFlagProvider>
          <TooltipProvider>
            <GlobalErrorBoundary>
              <RouteTracker />
              <Toaster />
              <Sonner />
              <FeatureFlaggedLiveBanner />
              <OfflineBanner />
              <AutoPushSubscriber />
              <PendingTestSyncWorker />
              <Suspense fallback={<RouteAwareLoadingScreen />}>
                <Routes>
                {/* Public Route*/}
                  <Route path="/" element={<Index />} />
                  <Route path="/why-us" element={<WhyUsPage />} />
                  <Route path="/about" element={<Navigate to="/why-us" replace />} />
                  <Route path="/faq" element={<FAQPage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                  <Route path="/terms-of-service" element={<TermsOfService />} />
                  <Route path="/refund-policy" element={<RefundPolicy />} />
                  <Route path="/install" element={<FeatureGate flagKey="install_app_prompt"><InstallApp /></FeatureGate>} />
                  <Route path="/share" element={<SharePage />} />
                  
                  {/* Authentication Routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  
                  {/* Goal Selection - requires auth */}
                  <Route path="/goal-selection" element={<ProtectedRoute><GoalSelectionPage /></ProtectedRoute>} />
                  <Route path="/pyq" element={<Navigate to="/tests" replace />} />
                  
                  
                
                {/* Dashboard = elegant EnhancedDashboard. Planner (Mission Home) is Pro/Pro+ only. */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardRouter />
                    </ProtectedRoute>
                  }
                />
                <Route path="/explore" element={<Navigate to="/dashboard" replace />} />
                <Route path="/planner" element={<Navigate to="/ai-planner" replace />} />
                <Route path="/mission" element={<Navigate to="/ai-planner" replace />} />

                
                {/* Test Routes */}
                <Route path="/test-attempt/:testId" element={
                  <ProtectedRoute><TestAttemptPage /></ProtectedRoute>
                } />
                <Route path="/test-attempt" element={
                  <ProtectedRoute><TestAttemptPage /></ProtectedRoute>
                } />
                <Route path="/test-results" element={
                  <ProtectedRoute><TestResultsPage /></ProtectedRoute>
                } />
                <Route path="/test-results/:sessionId" element={
                  <ProtectedRoute><TestResultsPage /></ProtectedRoute>
                } />
                <Route path="/test-history" element={
                  <ProtectedRoute><FeatureGate flagKey="test_history"><TestHistoryPage /></FeatureGate></ProtectedRoute>
                } />
                <Route path="/analytics" element={
                  <ProtectedRoute><FeatureGate flagKey="analytics"><PremiumGate featureName="Analytics"><AnalyticsPage /></PremiumGate></FeatureGate></ProtectedRoute>
                } />
                <Route path="/snapshot" element={
                  <ProtectedRoute><FeatureGate flagKey="snapshot"><FeatureGate flagKey="wrapped_yearbook"><WrappedPage /></FeatureGate></FeatureGate></ProtectedRoute>
                } />
                <Route path="/wrapped" element={<Navigate to="/snapshot" replace />} />
                <Route path="/subscription-plans" element={<FeatureGate flagKey="pricing_plans"><SubscriptionPlans /></FeatureGate>} />
                <Route path="/subscription" element={<Navigate to="/subscription-plans" replace />} />
                <Route
                  path="/pro-plus-library"
                  element={
                    <ProtectedRoute>
                      <FeatureGate flagKey="educator_content">
                        <ProPlusGate featureName="Educator PPTs and simulations">
                          <ProPlusLibraryPage />
                        </ProPlusGate>
                      </FeatureGate>
                    </ProtectedRoute>
                  }
                />

              
                {/* AI Study Planner */}
                <Route
                  path="/ai-planner"
                  element={
                    <ProtectedRoute>
                      <FeatureGate flagKey="study_planner">
                        <PremiumGate featureName="AI Study Planner">
                          <AIStudyPlannerPage />
                        </PremiumGate>
                      </FeatureGate>
                    </ProtectedRoute>
                  }
                />
                
                {/* Study Routes */}
                <Route
                  path="/study-now"
                  element={
                    <ProtectedRoute>
                      <FeatureGate flagKey="study_now">
                        <StudyNowPage />
                      </FeatureGate>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/practice"
                  element={
                    <ProtectedRoute>
                      <PracticePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/recap/:classLogId"
                  element={
                    <ProtectedRoute>
                      <ClassRecapTest />
                    </ProtectedRoute>
                  }
                />
                
                
                {/* Test Management */}
                <Route
                  path="/tests"
                  element={
                    <ProtectedRoute>
                      <FeatureGate flagKey="test_mode">
                        <TestPage />
                      </FeatureGate>
                    </ProtectedRoute>
                  }
                />
                
                {/* Profile */}
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                

                {/* Badges */}
                <Route
                  path="/badges"
                  element={
                    <ProtectedRoute>
                      <FeatureGate flagKey="badges">
                        <BadgesPage />
                      </FeatureGate>
                    </ProtectedRoute>
                  }
                />

                {/* Battle Mode (Pro+ only) */}
                <Route
                  path="/battle"
                  element={
                    <ProtectedRoute>
                      <FeatureGate flagKey="battle_mode">
                        <ProPlusGate featureName="Battle Mode">
                          <BattlePage />
                        </ProPlusGate>
                      </FeatureGate>
                    </ProtectedRoute>
                  }
                />

                {/* Group Test Routes */}
                <Route path="/group-test/create" element={
                  <ProtectedRoute><FeatureGate flagKey="group_tests"><CreateGroupTestPage /></FeatureGate></ProtectedRoute>
                } />
                <Route path="/group-test/join" element={
                  <ProtectedRoute><FeatureGate flagKey="group_tests"><JoinGroupTestPage /></FeatureGate></ProtectedRoute>
                } />
                <Route path="/group-test/:code/leaderboard" element={
                  <ProtectedRoute><FeatureGate flagKey="group_tests"><GroupTestLeaderboard /></FeatureGate></ProtectedRoute>
                } />

                {/* Settings */}
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                
                {/* Admin Routes - wildcard catches all /admin/* paths */}
                <Route
                  path="/admin/*"
                  element={
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  }
                />

                {/* Educator Routes */}
                <Route
                  path="/educator/*"
                  element={
                    <EducatorRoute>
                      <EducatorDashboard />
                    </EducatorRoute>
                  }
                />

                
                {/* 404 - Not Found */}
                <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              {/* Hide AI entry point on educator portal */}
              <FloatingAIEntry />
              <MobileBottomNav />
              <BadgeUnlockCelebration />
            </GlobalErrorBoundary>
          </TooltipProvider>
          </FeatureFlagProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

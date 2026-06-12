import React, { useState, useEffect, lazy, Suspense } from 'react';
import { logger } from '@/utils/logger';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  BarChart3, Users, BookOpen, Bell, FileText,
  CheckSquare, Home, Package,
  Eye, LogOut, Shield, ToggleLeft,
  Download, CreditCard,
} from 'lucide-react';

// Lazy load heavy admin components
const DashboardOverview = lazy(() => import('@/components/admin/dashboard/DashboardOverview'));
const AdminAnalytics = lazy(() => import('@/components/admin/AdminAnalytics').then(m => ({ default: m.AdminAnalytics })));
const UserManagement = lazy(() => import('@/components/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const AdminSetupHub = lazy(() => import('@/components/admin/AdminSetupHub'));
const ChapterManager = lazy(() => import('@/components/admin/ChapterManager'));
const NotificationManager = lazy(() => import('@/components/admin/NotificationManager').then(m => ({ default: m.NotificationManager })));
const PDFQuestionExtractor = lazy(() => import('@/components/admin/PDFQuestionExtractor').then(m => ({ default: m.PDFQuestionExtractor })));
const ExtractionReviewQueue = lazy(() => import('@/components/admin/ExtractionReviewQueue').then(m => ({ default: m.ExtractionReviewQueue })));

const EducatorContentManager = lazy(() => import('@/components/admin/EducatorContentManager'));
const FeatureFlagManager = lazy(() => import('@/components/admin/FeatureFlagManager'));


const ReportsHub = lazy(() => import('@/components/admin/ReportsHub'));
const HuggingFaceImporter = lazy(() => import('@/components/admin/HuggingFaceImporter'));
const NotesManager = lazy(() => import('@/components/admin/NotesManager'));
const SubscriptionManager = lazy(() => import('@/components/admin/SubscriptionManager'));

// ─── Nav Config ────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  group: 'main' | 'content' | 'tools';
}

const AdminDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [pendingEducatorReviewCount, setPendingEducatorReviewCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchPendingCount = async () => {
      try {
        const [queuePending, educatorPending] = await Promise.all([
          supabase
            .from('extracted_questions_queue')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('educator_content')
            .select('id', { count: 'exact', head: true })
            .eq('approval_status', 'pending'),
        ]);

        if (cancelled) return;

        setPendingReviewCount(queuePending.count || 0);
        setPendingEducatorReviewCount(educatorPending.count || 0);
      } catch (error) {
        if (!cancelled) {
          setPendingReviewCount(0);
          setPendingEducatorReviewCount(0);
          logger.error('Failed to load admin pending counts:', error);
        }
      }
    };
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const navItems: NavItem[] = [
    // Main
    { id: 'overview', label: 'Overview', icon: Home, group: 'main' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'main' },
    { id: 'users', label: 'Users', icon: Users, group: 'main' },
    { id: 'reports', label: 'Reports', icon: FileText, group: 'main' },
    { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard, group: 'main' },
    { id: 'notifications', label: 'Notifications', icon: Bell, group: 'main' },
    // Content
      { id: 'chapters', label: 'Chapters & Topics', icon: BookOpen, group: 'content' },
      { id: 'notes', label: 'Notes & Maps', icon: FileText, group: 'content' },
      { id: 'setup', label: 'Exams & Batches', icon: Package, group: 'content' },
      { id: 'educator-content', label: 'Educator Review', icon: CheckSquare, badge: pendingEducatorReviewCount, group: 'content' },
      // Questions tools
      { id: 'hf-importer', label: 'HF Importer', icon: Download, group: 'tools' },
      { id: 'pdf-extract', label: 'PDF Extractor', icon: FileText, group: 'tools' },
      { id: 'review-queue', label: 'Review Queue', icon: Eye, badge: pendingReviewCount, group: 'tools' },
    
    { id: 'feature-flags', label: 'Feature Flags', icon: ToggleLeft, group: 'tools' },
  ];

  const getCurrentSection = (): string => {
    const path = location.pathname;
    if (path === '/admin') return 'overview';
    const match = path.match(/\/admin\/(.+)/);
    if (match) {
      const item = navItems.find(i => i.id === match[1]);
      if (item) return item.id;
    }
    return 'overview';
  };

  const currentSection = getCurrentSection();

  const handleNavigation = (id: string) => {
    navigate(id === 'overview' ? '/admin' : `/admin/${id}`);
  };

  const sectionTitles: Record<string, string> = {
    overview: 'Dashboard',
    analytics: 'Analytics',
    users: 'User Management',
    reports: 'Reports',
    subscriptions: 'Subscriptions',
    notifications: 'Notifications',
    chapters: 'Chapters & Topics',
    notes: 'Notes & Concept Maps',
    setup: 'Exams & Batches',
    'educator-content': 'Educator Review',
    'pdf-extract': 'PDF Extractor',
    'review-queue': 'Review Queue',
    'hf-importer': 'Hugging Face Importer',
    'feature-flags': 'Feature Flags',
  };

  const renderContent = () => {
    switch (currentSection) {
      case 'overview': return <DashboardOverview />;
      case 'analytics': return <AdminAnalytics />;
      case 'users': return <UserManagement />;
      case 'reports': return <ReportsHub />;
      case 'subscriptions': return <SubscriptionManager />;
      case 'notifications': return <NotificationManager />;
      case 'chapters': return <ChapterManager />;
      case 'notes': return <NotesManager />;
      case 'setup': return <AdminSetupHub />;
      case 'educator-content': return <EducatorContentManager />;
      case 'pdf-extract': return <PDFQuestionExtractor />;
      case 'review-queue': return <ExtractionReviewQueue />;
      case 'hf-importer': return <HuggingFaceImporter />;
      case 'feature-flags': return <FeatureFlagManager />;
      default: return <DashboardOverview />;
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <SidebarProvider>
      <div className="admin-panel-hide-subtitles min-h-dvh overflow-hidden flex w-full flex-col md:flex-row bg-muted/30">
        {/* ─── Sidebar ─────────────────────────────────── */}
        <Sidebar collapsible="icon" className="border-r border-border z-50 md:h-dvh">
          <SidebarContent>
            {/* Logo / Brand */}
            <div className="p-4 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm text-foreground group-data-[collapsible=icon]:hidden">
                Admin Panel
              </span>
            </div>

            <Separator className="mx-2" />

            {/* Main Group */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Dashboard
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.filter(i => i.group === 'main').map(item => (
                    <NavItemButton
                      key={item.id}
                      item={item}
                      isActive={currentSection === item.id}
                      onClick={() => handleNavigation(item.id)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Content Group */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Content
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.filter(i => i.group === 'content').map(item => (
                    <NavItemButton
                      key={item.id}
                      item={item}
                      isActive={currentSection === item.id}
                      onClick={() => handleNavigation(item.id)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Tools Group */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                AI Tools
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.filter(i => i.group === 'tools').map(item => (
                    <NavItemButton
                      key={item.id}
                      item={item}
                      isActive={currentSection === item.id}
                      onClick={() => handleNavigation(item.id)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        {/* ─── Main Area ───────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top Bar */}
          <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-foreground">
                  {sectionTitles[currentSection] || 'Admin'}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/study-now', '_blank')}
                className="gap-1.5 text-xs"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">View as User</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0 overscroll-contain">
            <div className="p-3 sm:p-4 lg:p-6 pb-8 w-full max-w-7xl mx-auto min-w-0 overflow-x-auto">
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[400px]">
                  <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
              }>
                {renderContent()}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

// ─── Nav Item Sub-component ──────────────────────────────

interface NavItemButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}

const NavItemButton: React.FC<NavItemButtonProps> = ({ item, isActive, onClick }) => {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onClick}
        isActive={isActive}
        tooltip={item.label}
        className={cn(
          'transition-colors',
          isActive && 'bg-primary/10 text-primary font-medium'
        )}
      >
        <Icon className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && item.badge > 0 && (
          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold">
            {item.badge > 99 ? '99+' : item.badge}
          </Badge>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export default AdminDashboard;

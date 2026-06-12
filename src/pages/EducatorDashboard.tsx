import React, { useState, Suspense, lazy } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BookOpen, Beaker, Gamepad2, LogOut, ChevronDown, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import EducatorChapters from '@/components/educator/EducatorChapters';
import EducatorGames from '@/components/educator/EducatorGames';
import EducatorGroupTests from '@/components/educator/EducatorGroupTests';
import { Skeleton } from '@/components/ui/skeleton';
// Lazy — three.js (~600KB) loads only when the Virtual Lab tab is opened.
const VirtualLab = lazy(() => import('@/components/virtual-lab/VirtualLab'));

type Tab = 'chapters' | 'virtual-lab' | 'games' | 'group-tests';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'chapters', label: 'Chapters', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'virtual-lab', label: 'Virtual Lab', icon: <Beaker className="h-4 w-4" /> },
  { id: 'games', label: 'Games', icon: <Gamepad2 className="h-4 w-4" /> },
  { id: 'group-tests', label: 'Group Tests', icon: <Users className="h-4 w-4" /> },
];

const EducatorDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('chapters');

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Educator';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Sticky Header — always visible ─────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background border-b border-border shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-foreground text-base">JEEnie</span>
              <span className="text-[10px] font-semibold text-primary-foreground bg-primary rounded-full px-2 py-0.5">
                Educator
              </span>
            </div>

            {/* Tabs (Desktop) */}
            <nav className="hidden sm:flex items-center gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm text-muted-foreground max-w-[140px] truncate">
                    {displayName}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => signOut()}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="sm:hidden flex border-t border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground border-b-2 border-transparent'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'chapters' && <EducatorChapters />}
        {activeTab === 'virtual-lab' && (
          <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
            <VirtualLab />
          </Suspense>
        )}
        {activeTab === 'games' && <EducatorGames />}
        {activeTab === 'group-tests' && <EducatorGroupTests />}
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="text-center py-4 text-xs text-muted-foreground border-t border-border bg-background">
        JEEnie Educator Portal — Content on this portal is private and intended for classroom use only.
      </footer>
    </div>
  );
};

export default EducatorDashboard;

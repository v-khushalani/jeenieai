import React, { useEffect } from 'react';
import { Home, BookOpen, User, Target } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

const MobileNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const studyEnabled = useFeatureFlag('study_now');
  const testsEnabled = useFeatureFlag('test_mode');

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-mobile-nav-height', 'calc(4.5rem + env(safe-area-inset-bottom, 0px))');

    return () => {
      root.style.setProperty('--app-mobile-nav-height', '0px');
    };
  }, []);

  const baseItems = isAuthenticated ? [
    { icon: Home, label: 'Dashboard', path: '/dashboard', show: true },
    { icon: BookOpen, label: 'Study', path: '/study-now', show: studyEnabled },
    { icon: Target, label: 'Tests', path: '/tests', show: testsEnabled },
    { icon: User, label: 'Profile', path: '/profile', show: true }
  ].filter(i => i.show) : [
    { icon: Home, label: 'Home', path: '/' },
    { icon: User, label: 'Sign In', path: '/login' }
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/80 px-1 z-50 h-[calc(4.5rem+env(safe-area-inset-bottom,0))] shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
      <div className="flex h-full items-stretch justify-around max-w-md mx-auto pb-[env(safe-area-inset-bottom,0px)]">
        {baseItems.map((item, index) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 px-2 pt-1.5 rounded-xl transition-all duration-200 min-w-0 flex-1 active:scale-95 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />
              )}
              <item.icon className={`w-[22px] h-[22px] transition-transform ${isActive ? 'scale-110' : ''}`} strokeWidth={isActive ? 2.4 : 2} />
              <span className={`text-[11px] leading-none truncate max-w-full ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNavigation;

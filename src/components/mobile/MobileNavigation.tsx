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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-2xl border-t-2 border-primary/5 px-2 z-50 h-[calc(4.5rem+env(safe-area-inset-bottom,0))] shadow-[0_-8px_30px_rgba(15,23,42,0.12)]">
      <div className="flex h-full items-center justify-around max-w-md mx-auto pb-[env(safe-area-inset-bottom,0px)]">
        {baseItems.map((item, index) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={index}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-2xl transition-all duration-300 min-w-0 flex-1 tap-target group ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground/80 hover:text-primary/60'
              }`}
            >
              <div className={`relative transition-all duration-500 ${isActive ? 'scale-110 -translate-y-1' : 'group-active:scale-90'}`}>
                {isActive && (
                  <span className="absolute inset-0 -m-2 rounded-full bg-primary/10 blur-md animate-pulse" />
                )}
                <item.icon className={`w-[24px] h-[24px] relative z-10 transition-all ${isActive ? 'stroke-[2.5px] drop-shadow-[0_0_8px_rgba(37,99,235,0.3)]' : 'stroke-[2px]'}`} />
              </div>
              <span className={`text-[10px] uppercase tracking-widest leading-none truncate max-w-full italic transition-all ${isActive ? 'font-black opacity-100' : 'font-bold opacity-70'}`}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(37,99,235,0.8)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNavigation;

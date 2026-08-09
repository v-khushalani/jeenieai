// Compact XP ring + streak flame shown in the header on every screen.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { useXpStatus } from '@/hooks/useXpStatus';
import { useAuth } from '@/contexts/AuthContext';

const XpStreakChip: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { dailyXp, xpGoal, streak, loading } = useXpStatus();

  if (!isAuthenticated || loading) return null;

  const pct = Math.min(100, Math.round((dailyXp / Math.max(xpGoal, 1)) * 100));
  const goalMet = dailyXp >= xpGoal;
  // After 8pm IST an unmet goal shows a cold flame — the nudge to come back.
  const istHour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date())
  );
  const atRisk = !goalMet && istHour >= 20;

  const radius = 13;
  const circumference = 2 * Math.PI * radius;

  return (
    <button
      type="button"
      onClick={() => navigate('/league')}
      aria-label={`${dailyXp} of ${xpGoal} XP today, ${streak} day streak`}
      className={`flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 hover:bg-muted transition-colors ${className}`}
    >
      <span className="relative inline-flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
          <circle cx="16" cy="16" r={radius} className="stroke-muted" strokeWidth="4" fill="none" />
          <circle
            cx="16"
            cy="16"
            r={radius}
            className={goalMet ? 'stroke-emerald-500' : 'stroke-amber-500'}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (circumference * pct) / 100}
            style={{ transition: 'stroke-dashoffset 500ms ease' }}
          />
        </svg>
        <span className="absolute text-[9px] font-bold text-foreground">{pct}</span>
      </span>

      <span className="hidden sm:flex flex-col items-start leading-none">
        <span className="text-[11px] font-bold text-foreground">
          {dailyXp}<span className="text-muted-foreground font-normal">/{xpGoal} XP</span>
        </span>
        <span className="text-[10px] text-muted-foreground">aaj ka goal</span>
      </span>

      <span className="flex items-center gap-0.5 pl-1 border-l border-border">
        <Flame
          className={`w-4 h-4 ${streak > 0 && !atRisk ? 'text-orange-500' : 'text-muted-foreground'} ${atRisk ? 'animate-pulse' : ''}`}
          fill={streak > 0 && !atRisk ? 'currentColor' : 'none'}
        />
        <span className="text-xs font-bold text-foreground">{streak}</span>
      </span>
    </button>
  );
};

export default XpStreakChip;

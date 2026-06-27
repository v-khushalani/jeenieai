import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Target, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useTodaysMission } from '@/hooks/useTodaysMission';
import TodaysMissionCard from '@/components/mission/TodaysMissionCard';
import MissionPicker from '@/components/mission/MissionPicker';

/**
 * Compact one-row strip mounted at the top of the dashboard.
 * Tap → opens a bottom Sheet with the full mission card.
 */
export default function TodaysMissionStrip() {
  const { mission, needsColdStart, loading, regenerate } = useTodaysMission();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Cold start: render a slim "Pick your starting chapter" CTA (no Sheet trigger)
  if (needsColdStart) {
    return (
      <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30 p-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-primary" />
          <p className="text-xs sm:text-sm font-bold text-primary">🎯 Pick today's starting chapter</p>
        </div>
        <MissionPicker onPicked={regenerate} />
      </div>
    );
  }

  const pct = mission ? Math.round((mission.progress_count / Math.max(1, mission.target_count)) * 100) : 0;
  const isDone = mission?.status === 'completed';

  const label = loading
    ? 'Mission tayar ho raha hai…'
    : !mission
      ? 'Aaj ka mission'
      : isDone
        ? `${mission.chapter || 'Chapter'} • Done`
        : `${mission.chapter || mission.title} • ${mission.progress_count}/${mission.target_count}`;

  const handleQuickStart = (e: React.MouseEvent) => {
    if (loading || !mission || isDone) return;
    e.stopPropagation();
    if (mission.cta_route) navigate(mission.cta_route);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="w-full rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-indigo-50 via-white to-blue-50 dark:from-indigo-950/40 dark:via-background dark:to-blue-950/30 px-3 py-2.5 sm:py-3 shadow-sm hover:shadow-md transition-all flex items-center gap-2 text-left"
        >
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 text-white shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isDone ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider font-bold text-primary leading-none mb-0.5">
              🎯 Today's Mission
            </p>
            <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{label}</p>
            {mission && !isDone && (
              <div className="mt-1 h-1 w-full bg-primary/15 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-600 to-blue-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={handleQuickStart}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickStart(e as any); }}
            className={`text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
              isDone
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {isDone ? 'Bonus →' : mission?.progress_count ? 'Continue' : 'Start'}
            <ChevronRight className="inline h-3 w-3 ml-0.5" />
          </span>
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left mb-2">
          <SheetTitle className="text-base">🎯 Today's Mission</SheetTitle>
        </SheetHeader>
        <TodaysMissionCard variant="sheet" />
      </SheetContent>
    </Sheet>
  );
}

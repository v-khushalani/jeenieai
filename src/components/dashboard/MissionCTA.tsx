import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import safeLocalStorage from '@/utils/safeStorage';
import { missionKey } from '@/components/planner/MissionCoach';
import type { MissionTask } from '@/lib/missionEngine';

/** One-tap start for today's planner mission (computed on the Coach screen). */
export default function MissionCTA({ userId, className = '' }: { userId?: string; className?: string }) {
  const navigate = useNavigate();
  if (!userId) return null;
  let saved: { headline: string; first?: MissionTask } | null = null;
  try { saved = JSON.parse(safeLocalStorage.getItem(missionKey(userId)) || 'null'); } catch { saved = null; }
  const first = saved?.first;
  return (
    <button
      onClick={() => navigate(first?.href || '/ai-planner')}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-left transition active:scale-[0.98] ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">Aaj ka mission</p>
        <p className="truncate text-sm font-bold">{first ? first.title : 'Apna aaj ka plan dekho'}</p>
        {first && <p className="truncate text-[11px] text-muted-foreground">{first.why}</p>}
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
    </button>
  );
}

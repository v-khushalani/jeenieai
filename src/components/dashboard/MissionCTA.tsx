import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import safeLocalStorage from '@/utils/safeStorage';
import { missionKey, readEvidence, taskComplete } from '@/lib/plannerState';
import type { MissionTask } from '@/lib/missionEngine';

export default function MissionCTA({ userId, className = '' }: { userId?: string; className?: string }) {
  const navigate = useNavigate();
  const enabled = useFeatureFlag('study_planner');
  if (!userId || !enabled) return null;
  let tasks: MissionTask[] = [];
  try { tasks = JSON.parse(safeLocalStorage.getItem(missionKey(userId)) || '{}').tasks || []; } catch { /* no saved plan */ }
  const evidence = readEvidence(userId);
  const next = tasks.find(t => !taskComplete(t, evidence[t.id]));
  return <Button variant="outline" onClick={() => navigate('/ai-planner?view=today')} className={`h-auto w-full justify-between whitespace-normal p-3 text-left ${className}`}>
    <span className="min-w-0"><span className="block text-xs text-muted-foreground">Today’s plan</span><span className="block text-sm font-semibold">{next?.title || (tasks.length ? 'Today’s work complete' : 'Set your study priorities')}</span></span><ArrowRight />
  </Button>;
}

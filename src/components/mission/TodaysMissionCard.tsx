import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Target, Play, Clock, Trophy, CheckCircle2, Loader2 } from 'lucide-react';
import { useTodaysMission } from '@/hooks/useTodaysMission';
import MissionPicker from '@/components/mission/MissionPicker';

export default function TodaysMissionCard() {
  const navigate = useNavigate();
  const { mission, needsColdStart, loading, regenerate } = useTodaysMission();

  return (
    <Card className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-indigo-950/40 dark:via-background dark:to-blue-950/30 shadow-lg overflow-hidden">
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 sm:p-2 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md">
              <Target className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-primary">🎯 Today's Mission</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">AI Coach ka aaj ka plan</p>
            </div>
          </div>
          {mission?.status === 'completed' && (
            <Badge className="bg-emerald-500 text-white border-0 text-[10px] sm:text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Done
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
            <Loader2 className="h-4 w-4 animate-spin" /> Aaj ka mission tayar ho raha hai…
          </div>
        ) : needsColdStart ? (
          <MissionPicker onPicked={regenerate} />
        ) : mission ? (
          <>
            <h3 className="text-base sm:text-xl font-extrabold text-foreground leading-snug mb-1">
              {mission.title}
            </h3>
            {mission.subtitle && (
              <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">{mission.subtitle}</p>
            )}

            <div className="mb-3">
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold mb-1">
                <span className="text-foreground">{mission.progress_count}/{mission.target_count} questions</span>
                <span className="text-muted-foreground">
                  {Math.round((mission.progress_count / Math.max(1, mission.target_count)) * 100)}%
                </span>
              </div>
              <Progress
                value={(mission.progress_count / Math.max(1, mission.target_count)) * 100}
                className="h-2"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
              <Badge variant="outline" className="text-[10px] sm:text-xs gap-1">
                <Clock className="h-3 w-3" /> ~{mission.est_minutes} min
              </Badge>
              <Badge variant="outline" className="text-[10px] sm:text-xs gap-1 border-amber-300 text-amber-700 dark:text-amber-300">
                <Trophy className="h-3 w-3" /> +{mission.reward_points} pts on complete
              </Badge>
              {mission.subject && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs">{mission.subject}</Badge>
              )}
            </div>

            <Button
              onClick={() => mission.cta_route && navigate(mission.cta_route)}
              disabled={mission.status === 'completed'}
              className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md"
            >
              <Play className="h-4 w-4 mr-2" />
              {mission.status === 'completed'
                ? 'Mission complete!'
                : mission.progress_count > 0
                  ? 'Continue Mission'
                  : 'Start Mission'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Mission load nahi ho paaya. Pull-to-refresh karo.</p>
        )}
      </CardContent>
    </Card>
  );
}

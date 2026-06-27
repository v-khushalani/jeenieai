import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Target, Play, Clock, Trophy, CheckCircle2, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { useTodaysMission } from '@/hooks/useTodaysMission';
import MissionPicker from '@/components/mission/MissionPicker';

export type MissionCardVariant = 'hero' | 'sheet';

interface Props {
  variant?: MissionCardVariant;
  /** Hide the picker chrome card wrapper (used inside Sheet). */
  bare?: boolean;
}

export default function TodaysMissionCard({ variant = 'hero', bare = false }: Props) {
  const navigate = useNavigate();
  const { mission, needsColdStart, loading, justCompleted, acknowledgeCompletion, regenerate } = useTodaysMission();

  // 🎉 Confetti + toast exactly once when mission flips to completed
  useEffect(() => {
    if (!justCompleted || !mission) return;
    try {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, zIndex: 9999 });
    } catch {/* noop */}
    toast.success(`Mission Complete! +${mission.reward_points} JEEnie points 🎉`, {
      description: 'Bonus round bhi try karo — same chapter, no points cap.',
    });
    acknowledgeCompletion();
  }, [justCompleted, mission, acknowledgeCompletion]);

  const handleSwitchChapter = async () => {
    const res = await regenerate();
    if (!res.ok) {
      toast.error('Aaj ka switch ho chuka hai', {
        description: 'Ek din mein sirf 1 baar chapter change kar sakte ho. Kal naya mission milega!',
      });
    } else {
      toast.success('Naya chapter ready! 🎯');
    }
  };

  const Inner = (
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
      ) : mission && mission.status === 'completed' ? (
        // ── Mission Complete state ──
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h3 className="text-base sm:text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
              Mission Complete! +{mission.reward_points} pts 🎉
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mb-3">
            {mission.chapter ? `${mission.chapter} ka aaj ka target poora!` : 'Aaj ka target poora!'} Bonus round chalu rakho — points cap nahi, but streak & accuracy count hoti hai.
          </p>

          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
            <Badge variant="outline" className="text-[10px] sm:text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> {mission.progress_count}/{mission.target_count}
            </Badge>
            {mission.subject && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs">{mission.subject}</Badge>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => mission.cta_route && navigate(mission.cta_route.replace('mission=1', 'bonus=1'))}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
            >
              <Play className="h-4 w-4 mr-2" /> Bonus practice — same chapter
            </Button>
            <Button
              variant="outline"
              onClick={handleSwitchChapter}
              className="flex-1"
              disabled={(mission.reset_count || 0) >= 1}
              title={(mission.reset_count || 0) >= 1 ? 'Aaj ka switch ho chuka hai' : 'Naya chapter try karo (1/day)'}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Switch chapter
            </Button>
          </div>
        </div>
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
            className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md"
          >
            <Play className="h-4 w-4 mr-2" />
            {mission.progress_count > 0 ? 'Continue Mission' : 'Start Mission'}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Mission load nahi ho paaya. Pull-to-refresh karo.</p>
      )}
    </CardContent>
  );

  if (bare) return <div>{Inner}</div>;

  return (
    <Card className={
      variant === 'hero'
        ? 'rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-indigo-950/40 dark:via-background dark:to-blue-950/30 shadow-lg overflow-hidden'
        : 'rounded-2xl border-0 shadow-none bg-transparent'
    }>
      {Inner}
    </Card>
  );
}

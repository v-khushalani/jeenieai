import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Trophy, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface CelebrationCardProps {
  streak: number;
  xpEarned: number;
  tomorrowChapter?: string;
}

export const CelebrationCard: React.FC<CelebrationCardProps> = ({
  streak,
  xpEarned,
  tomorrowChapter
}) => {
  const navigate = useNavigate();

  return (
    <Card className="bg-gradient-to-br from-primary/20 via-primary/5 to-background border-primary/20 overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Trophy className="w-24 h-24 rotate-12" />
      </div>
      
      <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-bounce">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight">MISSION ACCOMPLISHED!</h2>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
            Bhai tu aag hai! 🔥 Aaj ka streak set hai.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full pt-2">
          <div className="bg-background/60 backdrop-blur-sm rounded-xl p-3 border border-primary/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">Streak</p>
            <p className="text-xl font-black">{streak} Days</p>
          </div>
          <div className="bg-background/60 backdrop-blur-sm rounded-xl p-3 border border-primary/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase">XP Gained</p>
            <p className="text-xl font-black">+{xpEarned}</p>
          </div>
        </div>

        {tomorrowChapter && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full border border-primary/10">
            <Target className="w-3.5 h-3.5 text-primary" />
            <p className="text-[11px] font-bold uppercase tracking-wider">
              Kal Ka Target: <span className="text-primary">{tomorrowChapter}</span>
            </p>
          </div>
        )}

        <Button 
          variant="outline" 
          className="w-full font-bold uppercase tracking-widest border-2"
          onClick={() => navigate('/practice')}
        >
          Explore More Questions
        </Button>
      </CardContent>
    </Card>
  );
};

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {  Trophy, Target, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

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
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full"
    >
      <Card className="bg-gradient-to-br from-primary/30 via-primary/10 to-background border-primary/20 overflow-hidden relative shadow-xl">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Trophy className="w-32 h-32 rotate-12" />
        </div>
        
        <CardContent className="p-8 flex flex-col items-center text-center space-y-6">
          <motion.div 
            animate={{ 
              rotate: [0, 10, -10, 10, 0],
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center relative"
          >
            
            <div className="absolute -top-1 -right-1">
              <Zap className="w-6 h-6 text-amber-500 fill-amber-500 animate-pulse" />
            </div>
          </motion.div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black tracking-tighter text-primary uppercase">MISSION ACCOMPLISHED!</h2>
            <p className="text-base font-black text-foreground uppercase tracking-wider">
              Bhai tu aag hai! 🔥 Aaj toh tune phod diya!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full pt-2">
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-4 border-2 border-primary/20 shadow-sm">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Current Streak</p>
              <p className="text-2xl font-black flex items-center justify-center gap-1">
                {streak} <span className="text-xs font-bold text-muted-foreground">Days</span>
              </p>
            </div>
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-4 border-2 border-primary/20 shadow-sm">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">XP Earned</p>
              <p className="text-2xl font-black text-amber-600 flex items-center justify-center gap-1">
                +{xpEarned} <span className="text-xs font-bold text-muted-foreground">XP</span>
              </p>
            </div>
          </div>

          {tomorrowChapter && (
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 shadow-inner">
              <Target className="w-4 h-4 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wider">
                Kal Ka Target: <span className="text-primary">{tomorrowChapter}</span>
              </p>
            </div>
          )}

          <Button 
            variant="default" 
            className="w-full h-14 font-black uppercase tracking-widest text-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
            onClick={() => navigate('/practice')}
          >
            Continue the Grind <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};

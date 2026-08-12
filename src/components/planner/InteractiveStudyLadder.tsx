import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Trophy, 
  Flame, 
  Star, 
  Lock, 
  Play, 
  CheckCircle2, 
  ChevronRight,
  TrendingUp,
  Target,
  Zap,
  Sword,
  Shield,
  Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoadmapChapter, SubjectRoadmap, MilestoneInfo, milestoneHref } from '@/lib/roadmapEngine';
import { useNavigate } from 'react-router-dom';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';

interface InteractiveStudyLadderProps {
  roadmap: SubjectRoadmap;
  xpPoints?: number;
  streak?: number;
}

const getMasteryColor = (status: RoadmapChapter['status'], accuracy: number) => {
  if (status === 'done') return 'bg-amber-400 border-amber-500 shadow-amber-200';
  if (status === 'active') {
    if (accuracy >= 0.7) return 'bg-emerald-500 border-emerald-600 shadow-emerald-200';
    if (accuracy > 0) return 'bg-blue-500 border-blue-600 shadow-blue-200';
    return 'bg-primary border-primary-foreground/20';
  }
  return 'bg-slate-200 border-slate-300 dark:bg-slate-800 dark:border-slate-700';
};

export const InteractiveStudyLadder: React.FC<InteractiveStudyLadderProps> = ({ 
  roadmap, 
  xpPoints = 0, 
  streak = 0 
}) => {
  const navigate = useNavigate();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(roadmap.activeChapterId);

  const activeChapter = useMemo(() => 
    roadmap.chapters.find(c => c.id === selectedChapterId) || roadmap.chapters.find(c => c.status === 'active'),
  [roadmap.chapters, selectedChapterId]);

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Dynamic Header Stats */}
      <div className="grid grid-cols-1 gap-3">
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100 overflow-hidden relative group hover:shadow-lg transition-all">
          <div className="absolute top-0 right-0 p-1 opacity-20 group-hover:scale-110 transition-transform">
            <Trophy className="w-12 h-12" />
          </div>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-full bg-amber-100 text-amber-600">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Jeenie Points</p>
                <p className="text-lg font-black text-amber-900 leading-none">{xpPoints}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* The Mastery Ladder */}
      <div className="flex gap-4">
        {/* The Vertical Path */}
        <div className="flex flex-col items-center relative w-12 pt-2">
          <div className="absolute top-0 bottom-0 w-1 bg-muted rounded-full" />
          {roadmap.chapters.map((chapter, idx) => {
            const isSelected = selectedChapterId === chapter.id;
            const isDone = chapter.status === 'done';
            const isActive = chapter.status === 'active';
            const masteryColor = getMasteryColor(chapter.status, chapter.accuracy);

            return (
              <div key={chapter.id} className="relative z-10 py-6">
                <motion.button
                  whileHover={{ scale: 1.3, y: -4, rotate: [0, -5, 5, 0] }}
                  whileTap={{ scale: 0.9 }}
                  animate={{ 
                    scale: isSelected ? 1.25 : isActive ? 1.15 : 1,
                    y: isSelected ? -2 : 0,
                    boxShadow: isSelected ? "0 0 20px rgba(59, 130, 246, 0.4)" : "0 4px 6px rgba(0,0,0,0.1)"
                  }}
                  onClick={() => setSelectedChapterId(chapter.id)}
                  className={`w-12 h-12 rounded-2xl border-4 flex items-center justify-center transition-all ${masteryColor} ${isSelected ? 'ring-4 ring-primary/20 scale-110' : ''}`}
                >
                  {isDone ? (
                    <Trophy className="w-6 h-6 text-white drop-shadow-sm" />
                  ) : isActive ? (
                    <div className="relative">
                      <Rocket className="w-6 h-6 text-white animate-bounce" />
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                    </div>
                  ) : chapter.status === 'locked' ? (
                    <Lock className="w-5 h-5 text-white/40" />
                  ) : (
                    <Star className="w-6 h-6 text-white/80" />
                  )}
                </motion.button>
                {isSelected && (
                  <motion.div 
                    layoutId="active-indicator"
                    className="absolute -inset-2.5 rounded-3xl border-2 border-primary border-dashed animate-spin-slow opacity-40"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Dynamic Detail Panel */}
        <div className="flex-1 space-y-4 min-w-0">
          <AnimatePresence mode="wait">
            {activeChapter ? (
              <motion.div
                key={activeChapter.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-1.5 h-4">
                      {formatSubjectDisplay(activeChapter.subject)}
                    </Badge>
                    {activeChapter.status === 'active' && (
                      <Badge className="bg-primary text-[9px] px-1.5 h-4 flex items-center gap-1 animate-pulse">
                        <Zap className="w-2 h-2" /> IN FOCUS
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-black leading-tight tracking-tight">
                    {activeChapter.title}
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${activeChapter.progressPct}%` }}
                        className="h-full bg-primary"
                      />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground whitespace-nowrap">
                      {activeChapter.progressPct}%
                    </span>
                  </div>
                </div>

                {/* Milestone Nodes */}
                <div className="grid gap-2">
                  {activeChapter.milestones.map((m) => {
                    const isDone = m.state === 'done';
                    const isLocked = activeChapter.status === 'locked' || (m.key !== 'learn' && activeChapter.milestones[0].state !== 'done');
                    
                    return (
                      <Card 
                        key={m.key} 
                        className={`transition-all ${isLocked ? 'opacity-50 grayscale' : isDone ? 'bg-emerald-50/50 border-emerald-100' : 'hover:border-primary/50 cursor-pointer hover:shadow-md'} border-2`}
                        onClick={() => !isLocked && !isDone && navigate(milestoneHref(activeChapter, m.key))}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isDone ? 'bg-emerald-100 text-emerald-600' : isLocked ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
                            {isDone ? <CheckCircle2 className="w-4 h-4" /> : isLocked ? <Lock className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold leading-none ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                              {m.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1 truncate">
                              {m.hint}
                            </p>
                          </div>
                          {!isLocked && !isDone && <Play className="w-4 h-4 text-primary animate-pulse" />}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {activeChapter.status === 'active' && (
                  <Button 
                    className="w-full h-12 text-sm font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                    onClick={() => {
                      const next = activeChapter.milestones.find(m => m.state !== 'done');
                      if (next) navigate(milestoneHref(activeChapter, next.key));
                    }}
                  >
                    Start Mission <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                )}
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2 opacity-50">
                <Target className="w-12 h-12" />
                <p className="text-sm font-bold uppercase tracking-widest">Select a Chapter</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

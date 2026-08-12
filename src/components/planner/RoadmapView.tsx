/**
 * RoadmapView — The Mastery Ladder.
 * Visual, interactive vertical progression for each subject.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2,  Target, Zap, Rocket } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import {
  buildSubjectRoadmap,
  subjectsForExam,
  type ExamKind,
  type SubjectRoadmap,
} from '@/lib/roadmapEngine';
import { InteractiveStudyLadder } from './InteractiveStudyLadder';

interface Props {
  userId: string;
  exam: ExamKind;
  classLevel?: number | null;
  initialSubject?: string;
  initialRoadmaps?: SubjectRoadmap[];
  xpPoints?: number;
  streak?: number;
  onRefresh?: () => void;
}


export default function RoadmapView({ 
  userId, 
  exam, 
  classLevel, 
  initialSubject, 
  initialRoadmaps,
  xpPoints,
  streak,
  onRefresh
}: Props) {

  const subjects = useMemo(() => subjectsForExam(exam), [exam]);
  const roadmapBySubject = useMemo(() => {
    const map = new Map<string, SubjectRoadmap>();
    (initialRoadmaps || []).forEach((roadmap) => map.set(roadmap.subject, roadmap));
    return map;
  }, [initialRoadmaps]);

  const [subject, setSubject] = useState<string>(initialSubject || subjects[0]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubjectRoadmap | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const preloaded = roadmapBySubject.get(subject);
    if (preloaded) {
      setData(preloaded);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await buildSubjectRoadmap(userId, exam, subject, classLevel);
      setData(r);
    } catch (e) {
      console.error(e);
      toast.error('Roadmap load nahi ho paya');
    } finally {
      setLoading(false);
    }
  }, [userId, exam, subject, roadmapBySubject, classLevel]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0]);
  }, [subjects, subject]);

  return (
    <div className="space-y-4">
      {/* Subject switcher */}
      <Tabs value={subject} onValueChange={setSubject} className="w-full">
        <TabsList className="grid w-full h-12 p-1.5 bg-muted/50 rounded-2xl border-2 border-border/50" style={{ gridTemplateColumns: `repeat(${subjects.length}, minmax(0, 1fr))` }}>
          {subjects.map((s) => (
            <TabsTrigger 
              key={s} 
              value={s} 
              className="text-[10px] font-black uppercase tracking-widest rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg transition-all duration-300"
            >
              {formatSubjectDisplay(s)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>


      {/* Loading */}
      {loading && (
        <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-bold uppercase tracking-widest opacity-60">Building your path...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.chapters.length === 0 && (
        <Card className="border-dashed border-2 bg-muted/20">
          <CardContent className="p-10 text-center space-y-3">
            
            <p className="text-base font-black tracking-tight">Jaldi aa raha hai!</p>
            <p className="text-sm text-muted-foreground font-medium">Is subject ke chapters abhi prep mein hain. Tab tak doosra try kar!</p>
          </CardContent>
        </Card>
      )}

      {/* The Interactive Ladder */}
      {!loading && data && data.chapters.length > 0 && (
        <InteractiveStudyLadder 
          roadmap={data} 
          xpPoints={xpPoints} 
          streak={streak} 
        />
      )}
    </div>
  );
}


/**
 * RoadmapView — mentor-driven chapter ladder.
 * Each chapter has 4 milestones the student walks through in order:
 *   Learn → Fix weak → Revise mistakes → Chapter test
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  Circle,
  Lock,
  Star,
  Play,
  Loader2,
  ChevronRight,
  Sparkles,
  Target,
  ListChecks,
  Trophy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import {
  buildSubjectRoadmap,
  milestoneHref,
  subjectsForExam,
  type ExamKind,
  type SubjectRoadmap,
  type RoadmapChapter,
  type MilestoneInfo,
} from '@/lib/roadmapEngine';

interface Props {
  userId: string;
  exam: ExamKind;
  /** Foundation students: restrict to this class only. */
  classLevel?: number | null;
  /** when set, prefill the subject switcher */
  initialSubject?: string;
  initialRoadmaps?: SubjectRoadmap[];
  onRefresh?: () => void;
}


function StarRow({ count }: { count: 0 | 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i <= count ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </div>
  );
}

function MilestoneChip({
  m,
  disabled,
  onClick,
}: {
  m: MilestoneInfo;
  disabled: boolean;
  onClick: () => void;
}) {
  const done = m.state === 'done';
  const inProgress = m.state === 'in_progress';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all',
        done
          ? 'border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-950/20'
          : inProgress
            ? 'border-primary/40 bg-primary/5'
            : 'border-border/60 bg-background',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/60',
      ].join(' ')}
    >
      <div className="shrink-0">
        {done ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        ) : disabled ? (
          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <Circle className={`w-4 h-4 ${inProgress ? 'text-primary' : 'text-muted-foreground'}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-[12px] font-semibold leading-tight ${done ? 'line-through text-muted-foreground' : ''}`}>
            {m.label}
          </p>
          {m.key === 'learn' && m.target > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {m.current}/{m.target}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug truncate">{m.hint}</p>
      </div>
      {!disabled && !done && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
    </button>
  );
}

function ChapterCard({
  chapter,
  expanded,
  onToggle,
  onMilestone,
}: {
  chapter: RoadmapChapter;
  expanded: boolean;
  onToggle: () => void;
  onMilestone: (m: MilestoneInfo) => void;
}) {
  const { status } = chapter;
  const isLocked = status === 'locked';
  const isDone = status === 'done';
  const isActive = status === 'active';

  const headerIcon = isDone ? (
    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
  ) : isActive ? (
    <div className="w-5 h-5 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
    </div>
  ) : (
    <Lock className="w-4 h-4 text-muted-foreground" />
  );

  return (
    <Card
      className={[
        'transition-all overflow-hidden',
        isActive ? 'border-primary/50 shadow-sm ring-1 ring-primary/20' : '',
        isLocked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={isLocked}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <div className="shrink-0">{headerIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">
              Ch {chapter.chapterNumber ?? '?'}
              {chapter.classLevel ? ` · Class ${chapter.classLevel}` : ''}
            </p>
            {isActive && (
              <Badge variant="default" className="h-4 text-[9px] px-1.5">
                ACTIVE
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold leading-tight truncate">{chapter.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <Progress value={chapter.progressPct} className="h-1 flex-1" />
            <span className="text-[10px] text-muted-foreground shrink-0">
              {chapter.attempts > 0 ? `${Math.round(chapter.accuracy * 100)}%` : '—'}
            </span>
            <StarRow count={chapter.stars} />
          </div>
        </div>
      </button>

      {expanded && !isLocked && (
        <CardContent className="px-3 pb-3 pt-0 space-y-1.5">
          {chapter.milestones.map((m) => {
            const dependsOnLearn = m.key !== 'learn' && chapter.milestones[0].state !== 'done';
            return (
              <MilestoneChip
                key={m.key}
                m={m}
                disabled={dependsOnLearn || m.state === 'done'}
                onClick={() => onMilestone(m)}
              />
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

export default function RoadmapView({ userId, exam, initialSubject, initialRoadmaps, onRefresh }: Props) {
  const navigate = useNavigate();
  const subjects = useMemo(() => subjectsForExam(exam), [exam]);
  const roadmapBySubject = useMemo(() => {
    const map = new Map<string, SubjectRoadmap>();
    (initialRoadmaps || []).forEach((roadmap) => map.set(roadmap.subject, roadmap));
    return map;
  }, [initialRoadmaps]);
  const [subject, setSubject] = useState<string>(initialSubject || subjects[0]);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubjectRoadmap | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const preloaded = roadmapBySubject.get(subject);
    if (preloaded) {
      setData(preloaded);
      setExpandedId(preloaded.activeChapterId);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await buildSubjectRoadmap(userId, exam, subject);
      setData(r);
      // auto-expand the active chapter
      setExpandedId(r.activeChapterId);
    } catch (e) {
      console.error(e);
      toast.error('Roadmap load nahi ho paya');
    } finally {
      setLoading(false);
    }
  }, [userId, exam, subject, roadmapBySubject]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0]);
  }, [subjects, subject]);

  const handleMilestone = (chapter: RoadmapChapter, m: MilestoneInfo) => {
    if (m.state === 'done') return;
    navigate(milestoneHref(chapter, m.key));
  };

  return (
    <div className="space-y-3">
      {/* Subject switcher */}
      <Tabs value={subject} onValueChange={setSubject}>
        <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${subjects.length}, minmax(0, 1fr))` }}>
          {subjects.map((s) => (
            <TabsTrigger key={s} value={s} className="text-xs">
              {formatSubjectDisplay(s)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Subject summary */}
      {data && !loading && (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-primary/80">
                {formatSubjectDisplay(subject)} Roadmap
              </p>
              <p className="text-sm font-bold leading-tight">
                {data.doneCount}/{data.totalCount} chapters cleared
              </p>
              {data.activeChapterId && (() => {
                const active = data.chapters.find((c) => c.id === data.activeChapterId);
                if (!active) return null;
                const nextMs = active.milestones.find((m) => m.state !== 'done');
                return (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Abhi: <span className="font-semibold text-foreground">{active.title}</span>
                    {nextMs ? ` — ${nextMs.label.toLowerCase()}` : ''}
                  </p>
                );
              })()}
            </div>
            {data.activeChapterId && (() => {
              const active = data.chapters.find((c) => c.id === data.activeChapterId);
              if (!active) return null;
              const nextMs = active.milestones.find((m) => m.state !== 'done');
              if (!nextMs) return null;
              return (
                <Button
                  size="sm"
                  className="shrink-0 h-8"
                  onClick={() => handleMilestone(active, nextMs)}
                >
                  <Play className="w-3 h-3 mr-1" /> Start
                </Button>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-xs">Roadmap bana raha hu…</p>
        </div>
      )}

      {/* Empty */}
      {!loading && data && data.chapters.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-primary mx-auto opacity-60" />
            <p className="text-sm font-semibold">Is subject ke chapters jaldi aa rahe hai</p>
            <p className="text-xs text-muted-foreground">Tab tak doosra subject try kar.</p>
          </CardContent>
        </Card>
      )}

      {/* Ladder */}
      {!loading && data && data.chapters.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <ListChecks className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Step-by-step chapter ladder
            </p>
          </div>
          {data.chapters.map((ch) => (
            <ChapterCard
              key={ch.id}
              chapter={ch}
              expanded={expandedId === ch.id}
              onToggle={() => setExpandedId(expandedId === ch.id ? null : ch.id)}
              onMilestone={(m) => handleMilestone(ch, m)}
            />
          ))}
          {data.doneCount === data.totalCount && (
            <Card className="border-emerald-300/50 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="p-3 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-600" />
                <p className="text-xs font-semibold">
                  {formatSubjectDisplay(subject)} pura cover ho gaya! 🎉
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

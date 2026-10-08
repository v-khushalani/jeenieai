import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import GoalProgress from '@/components/GoalProgress';
import { buildExamRoadmap, type CoachChapter, type RoadmapChapterSlot } from '@/lib/adaptiveCoach';

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const TIER: Record<number, string> = { 1: 'High scoring', 2: 'Core', 3: 'Low return' };

const hrefFor = (c: RoadmapChapterSlot) =>
  `/practice?${new URLSearchParams({ chapter_id: c.id, subject: c.subject, chapter: c.title, mode: c.attempts ? 'weak' : 'learn', target: '20' })}`;

interface Props {
  view: 'week' | 'plan';
  exam: string;
  daysLeft: number | null;
  chapters: CoachChapter[];
  weekCount: Record<string, number>;
}

export default function CoachHorizons({ view, exam, daysLeft, chapters, weekCount }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<RoadmapChapterSlot | null>(null);
  const map = useMemo(
    () => (daysLeft && chapters.length ? buildExamRoadmap(exam, chapters, daysLeft, istToday()) : null),
    [exam, daysLeft, chapters],
  );
  if (!map) return <p className="py-16 text-center text-sm text-muted-foreground">Plan ban raha hai…</p>;

  const Row = ({ c }: { c: RoadmapChapterSlot }) => (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => setOpen(c)}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${
        c.status === 'mastered' ? 'border-success bg-success text-success-foreground' :
        c.status === 'active' ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
        {c.status === 'mastered' ? <Check className="h-3.5 w-3.5" /> : c.status === 'dropped' ? '–' : ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{c.title}</span>
        <span className="block text-[11px] text-muted-foreground">{c.subject} · ~{c.expectedQ} Q/paper{c.attempts ? ` · ${c.accuracy}%` : ''}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </motion.button>
  );

  const weekDone = map.week.chapters.reduce((s, c) => s + (weekCount[c.id] || 0), 0);

  return (
    <div className="mx-auto max-w-xl space-y-6 px-1 pt-2">
      {view === 'week' ? (
        <section className="space-y-5">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{fmt(map.week.from)} – {fmt(map.week.to)}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Is hafte ka mission</h2>
          </div>
          {map.week.questionTarget > 0 && (
            <div className="rounded-3xl border border-border/60 bg-card p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-semibold">In chapters ke sawaal</span>
                <span className="text-sm tabular-nums text-muted-foreground">{Math.min(weekDone, map.week.questionTarget)}/{map.week.questionTarget}</span>
              </div>
              <GoalProgress got={weekDone} target={map.week.questionTarget} />
            </div>
          )}
          <div className="rounded-3xl border border-border/60 bg-card p-2">
            {map.week.chapters.map((c) => <Row key={c.id} c={c} />)}
            {!map.week.chapters.length && <p className="p-4 text-sm text-muted-foreground">Sab chapters ho gaye — ab sirf mocks.</p>}
          </div>
          <p className="text-center text-xs text-muted-foreground">{map.week.test}</p>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">Exam tak ka plan</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {map.masteredCount}/{chapters.length} mastered · roz ki progress se plan khud badalta hai
            </p>
          </div>
          {!map.onTrack && (
            <div className="rounded-3xl border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed">
              <b>Seedhi baat:</b> {map.behindBy} chapters is time mein fit nahi ho rahe. Inhe abhi chhod rahe hain taaki
              high-scoring chapters pakke hon. Tez chaloge to ye wapas plan mein aa jayenge.
            </div>
          )}
          {map.months.map((m, i) => (
            <motion.div
              key={m.index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`rounded-3xl border p-4 ${i === 0 ? 'border-primary/40 bg-card' : 'border-border/60 bg-card/60'}`}
            >
              <div className="flex items-start justify-between gap-2 px-1">
                <div>
                  <p className="text-sm font-extrabold">{m.label} {i === 0 && <span className="ml-1 text-[10px] font-bold uppercase text-primary">Abhi</span>}</p>
                  <p className="text-[11px] text-muted-foreground">{fmt(m.from)} – {fmt(m.to)}</p>
                </div>
                {i > 0 && m.kind !== 'mock' && <Lock className="h-4 w-4 text-muted-foreground" />}
              </div>
              <p className="mt-2 px-1 text-xs text-muted-foreground">{m.focus}</p>
              {m.chapters.length > 0 && (
                <div className="mt-2">{m.chapters.map((c) => <Row key={c.id} c={c} />)}</div>
              )}
            </motion.div>
          ))}
          {map.dropped.length > 0 && (
            <details className="rounded-3xl border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-semibold">Abhi chhode gaye ({map.dropped.length})</summary>
              <div className="mt-2">{map.dropped.map((c) => <Row key={c.id} c={c} />)}</div>
            </details>
          )}
        </section>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="bottom" className="rounded-t-[28px] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {open && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{open.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-muted/50 p-3"><p className="text-lg font-extrabold">~{open.expectedQ}</p><p className="text-[10px] text-muted-foreground">Q / paper</p></div>
                <div className="rounded-2xl bg-muted/50 p-3"><p className="text-lg font-extrabold">{open.attempts ? `${open.accuracy}%` : '—'}</p><p className="text-[10px] text-muted-foreground">Accuracy</p></div>
                <div className="rounded-2xl bg-muted/50 p-3"><p className="text-sm font-extrabold leading-7">{TIER[open.tier]}</p><p className="text-[10px] text-muted-foreground">{open.attempts} solved</p></div>
              </div>
              <Button className="mt-5 h-12 w-full rounded-2xl text-base font-bold" onClick={() => navigate(hrefFor(open))}>
                {open.status === 'scheduled' || open.status === 'dropped' ? 'Abhi shuru karo (aage badho)' : 'Practice shuru karo'}
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { buildCoachPlan, type CoachChapter, type HitTask } from '@/lib/adaptiveCoach';
import safeLocalStorage from '@/utils/safeStorage';

const PHASE: Record<string, string> = {
  sprint: 'Syllabus sprint',
  consolidate: 'Weak spots + timed tests',
  simulate: 'Mocks & revision',
};
const KIND: Record<string, string> = { sprint: 'Naya chapter', drill: 'Weak spot', revise: 'Revision', mock: 'Test' };

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Today's tasks are frozen per user + exam + IST date — refreshes never change them. */
export function lockTasks(userId: string, exam: string, fresh: HitTask[]): HitTask[] {
  const key = `jeenie:coach-lock:${userId}:${exam}:${istToday()}`;
  try {
    const raw = safeLocalStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as HitTask[];
      if (Array.isArray(saved) && saved.length) return saved;
    }
    if (fresh.length) safeLocalStorage.setItem(key, JSON.stringify(fresh));
  } catch { /* storage unavailable → use fresh */ }
  return fresh;
}

interface Props {
  userId: string;
  exam: string;
  daysLeft: number | null;
  chapters: CoachChapter[];
  todayCount: Record<string, number>;
}

export default function RealityCoach({ userId, exam, daysLeft, chapters, todayCount }: Props) {
  const navigate = useNavigate();
  const plan = useMemo(() => (daysLeft && chapters.length ? buildCoachPlan(exam, chapters, daysLeft) : null), [exam, daysLeft, chapters]);
  const tasks = useMemo(() => (plan ? lockTasks(userId, exam, plan.tasks) : []), [plan, userId, exam]);

  if (!plan) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Plan ban raha hai…</p>;
  }

  const noData = chapters.every((c) => c.attempts < 10);
  const progressOf = (t: HitTask) => (t.chapterId ? Math.min(t.target, todayCount[t.chapterId] || 0) : 0);
  const doneCount = tasks.filter((t) => t.chapterId && progressOf(t) >= t.target).length;

  return (
    <section className="mx-auto max-w-xl space-y-10 px-1 pt-2">
      {/* Countdown */}
      <div className="text-center">
        <p className="text-6xl font-extrabold tabular-nums tracking-tight">{plan.daysLeft}</p>
        <p className="mt-1 text-sm text-muted-foreground">din bache · {PHASE[plan.phase]}</p>
        <div className="mt-6 flex justify-center gap-10 text-sm">
          <div>
            <p className="text-lg font-bold tabular-nums">{plan.masteredCount}<span className="text-muted-foreground">/{plan.totalChapters}</span></p>
            <p className="text-xs text-muted-foreground">chapters mastered</p>
          </div>
          <div>
            <p className="text-lg font-bold tabular-nums">{noData ? '—' : `${plan.reachable[0]}–${plan.reachable[1]}`}</p>
            <p className="text-xs text-muted-foreground">{noData ? 'solve karo, estimate aayega' : 'realistic marks'}</p>
          </div>
        </div>
      </div>

      {/* Today */}
      <div>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-base font-bold">Aaj ka target</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{doneCount}/{tasks.length}</span>
        </div>
        <ul className="space-y-2">
          {tasks.map((t, i) => {
            const got = progressOf(t);
            const done = !!t.chapterId && got >= t.target;
            return (
              <motion.li key={t.kind + t.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <button
                  onClick={() => navigate(t.href)}
                  className={`flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition active:scale-[0.98] ${done ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-card hover:bg-muted/40'}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                    {done && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground">{KIND[t.kind]}</p>
                    <p className={`truncate font-semibold ${done ? 'text-muted-foreground line-through' : ''}`}>{t.title}</p>
                    {t.chapterId && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(got / t.target) * 100}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{got}/{t.target}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </motion.li>
            );
          })}
        </ul>
        {!noData && (
          <p className="mt-4 px-1 text-center text-[11px] text-muted-foreground">Marks estimate hai, guarantee nahi.</p>
        )}
      </div>
    </section>
  );
}

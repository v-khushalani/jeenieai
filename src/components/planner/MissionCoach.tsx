import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import {
  buildMission, type Cohort, type MissionAttempt, type MissionChapter, type MissionTask, type MissionTest,
} from '@/lib/missionEngine';
import safeLocalStorage from '@/utils/safeStorage';
import GoalProgress, { DoneTick } from '@/components/GoalProgress';

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const COHORTS: { id: Cohort; label: string; hint: string }[] = [
  { id: 'foundation', label: 'Foundation', hint: 'Shuruaat / Class 11' },
  { id: 'improver', label: 'Rank improve', hint: 'Syllabus ho chuka' },
  { id: 'sprint', label: '90-day sprint', hint: 'Exam paas hai' },
];
const KIND: Record<string, string> = {
  learn: 'Chapter', drill: 'Weak spot', repair: 'Mistake repair', careless: 'Careless trap',
  speed: 'Speed', test: 'Test', mock: 'Full mock', analysis: 'Analysis',
};

export const missionKey = (uid: string) => `jeenie:mission:${uid}:${istToday()}`;

interface Props {
  userId: string; exam: string; daysLeft: number | null; grade: number | null;
  chapters: (MissionChapter & { todayAttempts?: number })[];
  attempts: MissionAttempt[]; tests: MissionTest[];
}

export default function MissionCoach({ userId, exam, daysLeft, grade, chapters, attempts, tests }: Props) {
  const navigate = useNavigate();
  const overrideKey = `jeenie:cohort:${userId}`;
  const [override, setOverride] = useState<Cohort | null>(() => (safeLocalStorage.getItem(overrideKey) as Cohort) || null);
  const [clicked, setClicked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(safeLocalStorage.getItem(`${missionKey(userId)}:done`) || '[]')); } catch { return new Set(); }
  });
  const today = istToday();
  const testedToday = tests.some((t) => t.completedAt === today);

  const mission = useMemo(() => {
    if (!daysLeft || !chapters.length) return null;
    const fresh = buildMission({ exam, daysLeft, grade, chapters, attempts, tests, todayIso: today, cohortOverride: override });
    // Freeze today's tasks per cohort so refreshes don't reshuffle them.
    const lockKey = `${missionKey(userId)}:${fresh.cohort}`;
    try {
      const saved = safeLocalStorage.getItem(lockKey);
      if (saved) fresh.tasks = JSON.parse(saved) as MissionTask[];
      else safeLocalStorage.setItem(lockKey, JSON.stringify(fresh.tasks));
      safeLocalStorage.setItem(missionKey(userId), JSON.stringify({ headline: fresh.headline, first: fresh.tasks[0] }));
    } catch { /* ignore */ }
    return fresh;
  }, [exam, daysLeft, grade, chapters, attempts, tests, today, override, userId]);

  if (!mission) return <p className="py-16 text-center text-sm text-muted-foreground">Plan ban raha hai…</p>;

  const todayOf = (id?: string) => (id ? chapters.find((c) => c.id === id)?.todayAttempts || 0 : 0);
  const isDone = (t: MissionTask) => {
    if (t.kind === 'test' || t.kind === 'mock') return testedToday;
    if (t.kind === 'analysis' || !t.chapterId) return clicked.has(t.id);
    return todayOf(t.chapterId) >= t.target;
  };
  const open = (t: MissionTask) => {
    if (t.kind === 'analysis' || !t.chapterId) {
      const next = new Set(clicked); next.add(t.id); setClicked(next);
      try { safeLocalStorage.setItem(`${missionKey(userId)}:done`, JSON.stringify([...next])); } catch { /* ignore */ }
    }
    navigate(t.href);
  };
  const pickCohort = (c: Cohort) => {
    setOverride(c);
    try { safeLocalStorage.setItem(overrideKey, c); } catch { /* ignore */ }
  };
  const doneCount = mission.tasks.filter(isDone).length;
  const L = mission.leaks;
  const leakRows = [
    { label: 'Careless (45s se kam, galat)', v: L.careless },
    { label: 'Concept gap (2 min+, galat)', v: L.concept },
    { label: 'Baaki galat answers', v: L.otherWrong },
    { label: 'Test mein chhoote questions', v: L.unattempted },
  ].filter((r) => r.v > 0);

  return (
    <section className="mx-auto max-w-xl space-y-8 px-1 pt-2">
      <div className="text-center">
        <p className="text-6xl font-extrabold tabular-nums tracking-tight">{daysLeft}</p>
        <p className="mt-1 text-sm text-muted-foreground">din bache · {mission.phase}</p>
        <p className="mt-4 text-base font-bold">{mission.headline}</p>
        <p className="mt-1 text-xs text-muted-foreground">{mission.nextTest}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {COHORTS.map((c) => (
          <button key={c.id} onClick={() => pickCohort(c.id)}
            className={`rounded-2xl border p-2 text-left transition ${mission.cohort === c.id ? 'border-primary bg-primary/10' : 'border-border/50 bg-card'}`}>
            <p className="text-xs font-bold">{c.label}</p>
            <p className="text-[10px] text-muted-foreground">{c.hint}</p>
          </button>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-base font-bold">Aaj ka mission</h2>
          <span className="text-sm tabular-nums text-muted-foreground">{doneCount}/{mission.tasks.length}</span>
        </div>
        <ul className="space-y-2">
          {mission.tasks.map((t, i) => {
            const done = isDone(t);
            return (
              <motion.li key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <button onClick={() => open(t)}
                  className={`flex w-full items-start gap-4 rounded-3xl border p-4 text-left transition active:scale-[0.98] ${done ? 'border-success/40 bg-success/10' : 'border-border/50 bg-card hover:bg-muted/40'}`}>
                  <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-success bg-success text-success-foreground' : 'border-muted-foreground/30'}`}>
                    {done && <DoneTick />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground">{KIND[t.kind]} · {t.minutes} min</p>
                    <p className="font-semibold">{t.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t.why}</p>
                    {t.chapterId && t.kind !== 'test' && <div className="mt-2"><GoalProgress got={todayOf(t.chapterId)} target={t.target} /></div>}
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </motion.li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-3xl border border-border/50 bg-card p-4">
        <h3 className="text-sm font-bold">Score leak · pichle 14 din</h3>
        {leakRows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Abhi koi leak data nahi. Questions solve karo — har galti yahan marks mein dikhegi.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {leakRows.map((r) => (
              <li key={r.label} className="flex justify-between text-sm"><span className="text-muted-foreground">{r.label}</span><span className="font-bold tabular-nums">−{r.v}</span></li>
            ))}
            {L.topChapter && <li className="pt-2 text-xs text-muted-foreground">Sabse bada leak: <span className="font-semibold text-foreground">{L.topChapter.title}</span> (−{L.topChapter.marks})</li>}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">Har galat = −5 (4 chhoote + 1 negative). Estimate hai, guarantee nahi.</p>
      </div>
    </section>
  );
}

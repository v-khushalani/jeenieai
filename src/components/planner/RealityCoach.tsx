import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Target } from 'lucide-react';
import { buildCoachPlan, type CoachChapter } from '@/lib/adaptiveCoach';

const PHASE: Record<string, string> = {
  sprint: 'Phase 1 · Syllabus Sprint',
  consolidate: 'Phase 2 · Weak-spot + Timed Tests',
  simulate: 'Phase 3 · Mocks & Error Revision',
};
const KIND: Record<string, string> = { sprint: 'Sprint', drill: 'Drill', revise: 'Revise', mock: 'Mock' };

interface Props { exam: string; daysLeft: number | null; chapters: CoachChapter[]; doneIds: Set<string> }

export default function RealityCoach({ exam, daysLeft, chapters, doneIds }: Props) {
  const navigate = useNavigate();
  const plan = useMemo(() => (daysLeft && chapters.length ? buildCoachPlan(exam, chapters, daysLeft) : null), [exam, daysLeft, chapters]);
  if (!plan) return null;
  const noData = chapters.every((c) => c.attempts < 10);

  return (
    <section className="space-y-3">
      <div className="rounded-[24px] border border-border/60 bg-card p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-2xl font-extrabold">{plan.daysLeft}</p><p className="text-[10px] text-muted-foreground">days left</p></div>
          <div><p className="text-2xl font-extrabold">{plan.masteredCount}<span className="text-sm text-muted-foreground">/{plan.totalChapters}</span></p><p className="text-[10px] text-muted-foreground">chapters mastered</p></div>
          <div><p className="text-xs font-bold leading-tight text-primary pt-1">{PHASE[plan.phase]}</p></div>
        </div>
        <div className="mt-3 rounded-2xl bg-muted/50 p-3 text-xs leading-relaxed">
          {noData ? (
            <p>Abhi projection nahi — kam se kam 10 questions per chapter solve kar, tab honest marks estimate dikhega.</p>
          ) : (
            <p>
              Current pace: <b>{plan.projected[0]}–{plan.projected[1]}</b>/{plan.maxMarks}. Realistic reach in {plan.daysLeft} days (6 hrs/day): <b>{plan.reachable[0]}–{plan.reachable[1]}</b>.
              {' '}Ye estimate hai, guarantee nahi.
            </p>
          )}
          {plan.skip.length > 0 && <p className="mt-1 text-muted-foreground">Abhi chhod: {plan.skip.join(', ')} — time zyada, marks kam.</p>}
        </div>
      </div>

      <div className="rounded-[24px] border border-border/60 bg-card p-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold"><Target className="h-4 w-4 text-primary" /> Aaj ka target</p>
        <ul className="space-y-2">
          {plan.tasks.map((t) => {
            const done = !!t.chapterId && doneIds.has(t.chapterId);
            return (
              <li key={t.kind + t.title}>
                <button onClick={() => navigate(t.href)} className="flex w-full items-center gap-3 rounded-2xl border border-border/50 p-3 text-left transition active:scale-[0.98] hover:bg-muted/40">
                  {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{KIND[t.kind]}: {t.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{t.target > 1 ? `${t.target} questions · ` : ''}{t.detail}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
        {plan.unlock && (
          <p className="mt-3 text-[11px] text-muted-foreground">Next unlock: <b className="text-foreground">+{plan.unlock.marks} marks</b> if {plan.unlock.chapter} hits 80%.</p>
        )}
      </div>
    </section>
  );
}

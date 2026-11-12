import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildMissionWeek, type MissionInput } from '@/lib/missionEngine';
import type { PlannerPreferences } from '@/lib/plannerState';

export default function CoachHorizons({ view, input, preferences }: { view: 'week' | 'plan'; input: MissionInput; preferences: PlannerPreferences }) {
  const navigate = useNavigate();
  const week = useMemo(() => buildMissionWeek(input, preferences.weekdayMinutes, preferences.weekendMinutes), [input, preferences]);
  if (view === 'plan') {
    const subjects = [...new Set(input.chapters.map(c => c.subject))];
    return <section className="mx-auto max-w-3xl space-y-6">
      <header><h2 className="text-2xl font-bold">Preparation overview</h2><p className="mt-2 text-sm text-muted-foreground">{input.daysLeft} days remaining · {week[0].mission.phase}</p></header>
      <p className="text-sm text-muted-foreground">{input.grade ? `Class ${input.grade} syllabus only.` : 'Your active exam syllabus.'} Chapter accuracy is evidence, not a promise of exam readiness.</p>
      {subjects.map(subject => <section key={subject} className="border-t border-border pt-5"><h3 className="font-semibold">{subject}</h3><ul className="mt-3 divide-y divide-border">{input.chapters.filter(c => c.subject === subject).map(c => <li key={c.id} className="flex items-start justify-between gap-4 py-3"><span className="min-w-0 break-words text-sm">{c.title}</span><span className="shrink-0 text-right text-xs text-muted-foreground">{c.totalQuestions === 0 ? 'No questions yet' : c.attempts < 5 ? 'Insufficient evidence' : `${c.accuracy}% · ${c.attempts} questions`}{c.pendingMistakes > 0 && <span className="block">{c.pendingMistakes} mistakes pending</span>}</span></li>)}</ul></section>)}
      <section className="border-t border-border pt-5"><h3 className="font-semibold">Next checkpoint</h3><p className="mt-2 text-sm text-muted-foreground">{week[0].mission.nextTest}</p><Button variant="outline" className="mt-3" onClick={() => navigate('/tests')}>Choose a test<ArrowRight /></Button></section>
    </section>;
  }
  return <section className="mx-auto max-w-3xl space-y-5"><header><h2 className="text-2xl font-bold">The next seven days</h2><p className="mt-2 text-sm text-muted-foreground">Provisional schedule · assumes planned tests are completed. Updated after actual practice and results.</p></header>
    <ol className="divide-y divide-border">{week.map(({ date, mission }, i) => <li key={date} className="py-5"><div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold">{i === 0 ? 'Today' : new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</h3><span className="text-xs text-muted-foreground">{mission.plannedMinutes}/{mission.budgetMinutes} min</span></div>
      <p className="mt-2 text-sm text-muted-foreground">{mission.tasks.map(t => t.kind === 'analysis' ? 'Test analysis' : t.kind === 'mock' ? 'Full mock' : t.subject).filter((v, i, all) => all.indexOf(v) === i).join(' · ') || 'Rest / reset'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{mission.tasks.some(t => t.kind === 'analysis') ? 'Review wrong and skipped questions' : mission.tasks.some(t => t.kind === 'mock' || t.kind === 'test') ? 'Timed checkpoint' : 'Coaching practice and targeted repair'}</p>
      {i === 0 && <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate('/ai-planner?view=today')}>Open today<ArrowRight /></Button>}
    </li>)}</ol>
  </section>;
}

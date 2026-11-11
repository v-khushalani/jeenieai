import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Settings2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { buildMission, type MissionInput } from '@/lib/missionEngine';
import { defaultPreferences, missionKey, readEvidence, readPreferences, savePreferences, taskComplete, writeEvidence, type PlannerPreferences } from '@/lib/plannerState';
import safeLocalStorage from '@/utils/safeStorage';
import GoalProgress from '@/components/GoalProgress';

interface Props { userId: string; input: MissionInput; preferences: PlannerPreferences; onPreferences: (p: PlannerPreferences) => void }
export default function MissionCoach({ userId, input, preferences, onPreferences }: Props) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(false);
  const [evidence, setEvidence] = useState(() => readEvidence(userId));
  const [notice, setNotice] = useState('');
  const mission = useMemo(() => buildMission(input), [input]);
  const unfinished = mission.tasks.filter(t => !taskComplete(t, evidence[t.id]));
  useEffect(() => {
    safeLocalStorage.setItem(missionKey(userId), JSON.stringify({ tasks: mission.tasks }));
  }, [mission, userId]);
  const update = (p: PlannerPreferences) => { savePreferences(userId, p); onPreferences(p); };
  const acknowledge = (id: string, analysis = false) => {
    const value = { questionIds: evidence[id]?.questionIds || [], offline: !analysis, reviewed: analysis };
    writeEvidence(userId, id, value);
    setEvidence(readEvidence(userId));
  };
  return <section className="mx-auto max-w-3xl space-y-6">
    <header className="border-b border-border pb-5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs text-muted-foreground">{input.exam} · {input.grade ? `Class ${input.grade} only` : 'Exam syllabus'} · {input.daysLeft} days remaining</p>
          <h2 className="mt-2 text-2xl font-bold">{mission.headline}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{mission.phase} · {mission.plannedMinutes} / {mission.budgetMinutes} minutes</p></div>
        <Button variant="outline" size="icon" aria-label="Planner settings" onClick={() => setSettings(true)}><Settings2 /></Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{mission.nextTest}</p>
    </header>
    {mission.warnings.map(w => <p key={w} className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">{w}</p>)}
    <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Today’s work</h3><span className="text-sm text-muted-foreground">{mission.tasks.length - unfinished.length}/{mission.tasks.length} complete</span></div>
    <ol className="divide-y divide-border">
      {mission.tasks.map((task, i) => {
        const done = taskComplete(task, evidence[task.id]);
        return <li key={task.id} className="py-5 first:pt-0">
          <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{done ? <Check className="h-4 w-4" /> : i + 1}</span>
            <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{task.subject || 'Test review'} · {task.lane === 'coaching' ? 'Coaching' : task.lane === 'backlog' ? 'Backlog' : task.kind} · {task.minutes} min</p>
              <h4 className="mt-1 break-words font-semibold">{task.title}</h4><p className="mt-2 text-sm text-muted-foreground">{task.why}</p>
              {task.chapterId && task.kind !== 'test' && <div className="mt-3"><GoalProgress got={evidence[task.id]?.questionIds.length || 0} target={task.target} /></div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant={done ? 'outline' : 'default'} onClick={() => navigate(task.href)}>{done ? 'Open again' : task.kind === 'analysis' ? 'Open review' : 'Start'}<ArrowRight /></Button>
                {!done && <Button size="sm" variant="ghost" onClick={() => acknowledge(task.id, task.kind === 'analysis')}>
                  <Check />{task.kind === 'analysis' ? 'Review completed' : 'Done offline'}</Button>}
                {done && evidence[task.id]?.offline && <span className="self-center text-xs text-muted-foreground">Self-reported · not mastery evidence</span>}
              </div>
            </div></div>
        </li>;
      })}
    </ol>
    {mission.tasks.length > 0 && !unfinished.length && <p className="text-sm font-medium">Today’s plan is complete. No extra work added.</p>}
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <Button variant="outline" onClick={() => { setSettings(true); setNotice('Adjust today’s available time. Unfinished work is reprioritised, not stacked as overdue work.'); }}><RotateCcw />Recalibrate</Button>
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    </div>
    <section className="border-t border-border pt-5">
      <h3 className="font-semibold">Mistake patterns · last 14 days</h3>
      <p className="mt-1 text-xs text-muted-foreground">Timing suggests patterns, not causes. No score or percentile prediction.</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Fast incorrect', mission.leaks.careless / 5], ['Long incorrect', mission.leaks.concept / 5],
          ['Other incorrect', mission.leaks.otherWrong / 5], ['Slow correct', mission.leaks.slowCorrect],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      {mission.leaks.topChapter && <p className="mt-3 text-sm text-muted-foreground">Most recorded mistakes: {mission.leaks.topChapter.title}</p>}
    </section>
    <Sheet open={settings} onOpenChange={setSettings}><SheetContent className="overflow-y-auto"><SheetHeader><SheetTitle>Your preparation</SheetTitle></SheetHeader>
      <div className="mt-6 space-y-6">
        <div className="space-y-2"><Label htmlFor="planner-mode">Preparation stage</Label><select id="planner-mode" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={preferences.cohort || ''} onChange={e => update({ ...preferences, cohort: e.target.value as PlannerPreferences['cohort'] || null })}>
          <option value="">Automatic</option><option value="foundation">Learning from basics</option><option value="improver">Prepared · strengthen weak spots</option><option value="sprint">Crash preparation</option></select></div>
        {[['weekdayMinutes', 'Weekday self-study minutes'], ['weekendMinutes', 'Weekend self-study minutes']].map(([key, label]) => <div className="space-y-2" key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min={15} max={720} step={15} value={preferences[key as 'weekdayMinutes' | 'weekendMinutes']} onChange={e => { const n = Number(e.target.value); if (n >= 15 && n <= 720) update({ ...preferences, [key]: n }); }} /></div>)}
        <div className="space-y-4"><h3 className="text-sm font-semibold">Current coaching chapters</h3>{[...new Set(input.chapters.map(c => c.subject))].map(subject => <div key={subject} className="space-y-2"><Label htmlFor={`coaching-${subject}`}>{subject}</Label><select id={`coaching-${subject}`} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={preferences.coaching[subject] || ''} onChange={e => update({ ...preferences, coaching: { ...preferences.coaching, [subject]: e.target.value } })}><option value="">Let my practice guide the plan</option>{input.chapters.filter(c => c.subject === subject && c.totalQuestions !== 0).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>)}</div>
        <div className="space-y-2"><Label htmlFor="backlog">Backlog priority · active class only</Label><select id="backlog" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={preferences.backlogId} onChange={e => update({ ...preferences, backlogId: e.target.value })}><option value="">No separate backlog</option>{input.chapters.filter(c => c.totalQuestions !== 0).map(c => <option key={c.id} value={c.id}>{c.subject} · {c.title}</option>)}</select></div>
        <Button className="w-full" onClick={() => { setSettings(false); setNotice('Plan updated within your available time.'); }}>Save and return</Button>
        <p className="text-xs text-muted-foreground">Settings and offline check-offs are saved on this device.</p>
      </div>
    </SheetContent></Sheet>
  </section>;
}

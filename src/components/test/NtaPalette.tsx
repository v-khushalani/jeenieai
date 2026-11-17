import { NtaSubject, NtaStatus } from '@/lib/ntaLayout';

export const NTA_COLORS: Record<NtaStatus, string> = {
  'not-visited': 'bg-muted text-foreground',
  'not-answered': 'bg-red-500 text-white',
  answered: 'bg-green-600 text-white',
  marked: 'bg-violet-600 text-white',
  'answered-marked': 'bg-violet-600 text-white ring-2 ring-inset ring-green-400',
};

export const NTA_LEGEND: { s: NtaStatus; label: string }[] = [
  { s: 'not-visited', label: 'Not Visited' },
  { s: 'not-answered', label: 'Not Answered' },
  { s: 'answered', label: 'Answered' },
  { s: 'marked', label: 'Marked for Review' },
  { s: 'answered-marked', label: 'Answered & Marked (will be evaluated)' },
];

interface Props {
  layout: NtaSubject[];
  activeSubject: string;
  current: number;
  statusOf: (i: number) => NtaStatus;
  onPick: (i: number) => void;
  big?: boolean;
}

export function NtaSubjectTabs({ layout, activeSubject, onPick }: Pick<Props, 'layout' | 'activeSubject' | 'onPick'>) {
  return (
    <div className="flex gap-1 overflow-x-auto mb-2 shrink-0" role="tablist">
      {layout.map((s) => {
        const active = s.subject === activeSubject;
        const total = s.sections.reduce((n, x) => n + x.indices.length, 0);
        return (
          <button key={s.subject} role="tab" aria-selected={active}
            onClick={() => onPick(s.sections[0].indices[0])}
            className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap border transition-colors ${
              active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}>
            {s.subject} <span className="opacity-70 font-normal">({total})</span>
          </button>
        );
      })}
    </div>
  );
}

export function NtaPalette({ layout, activeSubject, current, statusOf, onPick, big }: Props) {
  const subj = layout.find((s) => s.subject === activeSubject) || layout[0];
  if (!subj) return null;
  const size = big ? 'w-11 h-11 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className="space-y-3 mb-4">
      <p className="text-sm font-semibold">{subj.subject}</p>
      {subj.sections.map((sec) => (
        <div key={sec.label}>
          <p className="text-xs text-muted-foreground mb-1.5">
            {sec.label} · {sec.label === 'Section A' ? 'MCQ' : 'Numerical'} ({sec.indices.length})
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {sec.indices.map((i) => (
              <button key={i} onClick={() => onPick(i)}
                className={`${size} rounded border-2 transition-all ${i === current ? 'border-primary scale-110' : 'border-transparent'} ${NTA_COLORS[statusOf(i)]}`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="space-y-1.5 text-xs pt-2 border-t">
        {NTA_LEGEND.map((l) => (
          <div key={l.s} className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded shrink-0 ${NTA_COLORS[l.s]}`} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

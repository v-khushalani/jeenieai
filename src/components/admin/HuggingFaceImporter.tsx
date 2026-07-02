import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, GitBranch, Sparkles, Database, AlertCircle, X } from 'lucide-react';
import { MathDisplay } from '@/components/admin/MathDisplay';

const formatInvokeError = (error: any): string => {
  if (!error) return 'Unknown edge function error';
  const parts = [error.message || 'Unknown error'];
  if (error.name) parts.push(`type=${error.name}`);
  if (error.context) parts.push(`context=${String(error.context).slice(0, 160)}`);
  if (error.details) parts.push(`details=${String(error.details).slice(0, 160)}`);
  if (error.hint) parts.push(`hint=${String(error.hint).slice(0, 160)}`);
  return parts.join(' | ');
};

interface Preset {
  id: string;
  label: string;
  description: string;
  datasetPath: string;
  split: string;
  expectedRows: number;
  datasetProfile: string;
  jeeOnly: boolean;
}

const PRESETS: Preset[] = [
  {
    id: 'datavorous/entrance-exam-dataset',
    label: 'Entrance Exam Dataset (JEE + NEET PYQs)',
    description:
      '~97k mixed PYQs. HTML auto-cleaned, LaTeX preserved. Subject, chapter, exam, session, year all extracted from tags. JEE and NEET rows are both imported.',
    datasetPath: 'datavorous/entrance-exam-dataset',
    split: 'train',
    expectedRows: 97000,
    datasetProfile: 'entrance-exam',
    jeeOnly: false,
  },
];

interface JobRow {
  id: string;
  status: string;
  total: number | null;
  imported: number;
  skipped: number;
  chapters_created: number;
  topics_created: number;
  skip_reasons: Record<string, number>;
  error: string | null;
  finished_at: string | null;
  started_at?: string | null;
  options?: Record<string, any> | null;
}

type Step = 'choose' | 'preview' | 'running' | 'done';

export default function HuggingFaceImporter() {
  const [step, setStep] = useState<Step>('choose');
  const [datasetPath, setDatasetPath] = useState('');
  const [split, setSplit] = useState('train');
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [demoSourceTag, setDemoSourceTag] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const pollRef = useRef<number | null>(null);

  // ── Auto-detect and resume in-progress jobs on mount ──
  useEffect(() => {
    if (jobId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('import_jobs')
        .select('id, status, total, imported, skipped, chapters_created, topics_created, skip_reasons, error, finished_at, started_at, options')
        .in('status', ['pending', 'running'])
        .order('started_at', { ascending: false })
        .limit(10);
      if (cancelled) return;
      const running = (data || []).find((j: any) => j.options?.datasetPath || j.dataset_path?.startsWith('datavorous/'));
      if (running) {
        setJobId(running.id);
        setJob(running as any);
        setStep('running');
        toast.message('Resuming in-progress import…', { description: `${(running.imported ?? 0).toLocaleString()} done so far` });
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  // ── Polling ──
  useEffect(() => {
    if (!jobId) return;
    const tick = async () => {
      const { data, error } = await supabase.functions.invoke('hf-dataset-importer', {
        body: { action: 'status', jobId },
      });
      if (error) return;
      const j: JobRow | null = data?.job ?? null;
      if (j) {
        setJob(j);
        if (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') {
          setStep('done');
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 2000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [jobId]);

  // ── Peek ──
  const peek = async (path: string, splitVal: string) => {
    setPreviewing(true);
    const tId = toast.loading('Loading preview…');
    try {
      const { data, error } = await supabase.functions.invoke('hf-dataset-importer', {
        body: { action: 'peek', datasetPath: path, split: splitVal },
      });
      if (error) throw new Error(formatInvokeError(error));
      if (data?.error) throw new Error(data.error);
      setPreview(data.preview);
      setDatasetPath(path);
      setSplit(splitVal);
      setStep('preview');
      toast.success(`Loaded ${data.preview.totalRows?.toLocaleString() ?? '?'} rows`, { id: tId });
    } catch (e: any) {
      toast.error(`Peek failed: ${e.message}`, { id: tId });
    } finally {
      setPreviewing(false);
    }
  };

  // ── Start import ──
  const startImport = async (preset: Preset, options: Record<string, any> | null = null) => {
    setActivePreset(preset);
    const tId = toast.loading('Starting import…');
    try {
      const body: Record<string, any> = {
        action: 'import',
        datasetPath: preset.datasetPath,
        split: preset.split,
        sourceTag: preset.id,
        datasetProfile: preset.datasetProfile,
        jeeOnly: preset.jeeOnly,
      };
      if (options) Object.assign(body, options);

      const { data, error } = await supabase.functions.invoke('hf-dataset-importer', {
        body,
      });
      if (error) throw new Error(formatInvokeError(error));
      if (data?.error) throw new Error(data.error);
      setJobId(data.job_id);
      setStep('running');
      // persist demo source tag if provided
      if (body.sourceTag && String(body.sourceTag).includes('-demo-')) setDemoSourceTag(String(body.sourceTag));
      toast.success('Import started in the background', { id: tId });
    } catch (e: any) {
      toast.error(`Failed to start: ${e.message}`, { id: tId });
    }
  };

  const startDemoImport = async (preset: Preset) => {
    const demoTag = `${preset.id}-demo-${Date.now()}`;
    await startImport({ ...preset, id: demoTag }, { sourceTag: demoTag, limit: 2000, demo: true });
  };

  const revertDemoImport = async (sourceTag: string | null) => {
    if (!sourceTag) return toast.error('No demo source tag available');
    const tid = toast.loading('Reverting demo import…');
    try {
      const { data, error } = await supabase.functions.invoke('utils/reset-database', {
        body: { action: 'revert_import', sourceTag },
      });
      if (error) throw new Error(formatInvokeError(error));
      if (data?.error) throw new Error(data.error);
      setDemoSourceTag(null);
      toast.success(`Reverted demo import — deleted ${data.deleted || 0} questions`, { id: tid });
      // refresh
      reset();
    } catch (e: any) {
      toast.error(`Revert failed: ${e.message}`, { id: tid });
    }
  };

  const cancel = async () => {
    if (!jobId) return;
    // Optimistically reflect cancellation immediately in UI
    if (pollRef.current) window.clearInterval(pollRef.current);
    setJob((prev) => (prev ? { ...prev, status: 'cancelled', finished_at: new Date().toISOString() } : prev));
    setStep('done');
    toast.success('Import cancelled');
    // Fire-and-forget server-side cancel
    supabase.functions
      .invoke('hf-dataset-importer', { body: { action: 'cancel', jobId } })
      .catch(() => {});
  };

  const reset = () => {
    setStep('choose');
    setPreview(null);
    setActivePreset(null);
    setJobId(null);
    setJob(null);
  };

  const total = job?.total ?? activePreset?.expectedRows ?? 0;
  const done = (job?.imported ?? 0) + (job?.skipped ?? 0);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  // Throughput + ETA
  const startMs = (job as any)?.started_at ? new Date((job as any).started_at).getTime() : null;
  const elapsedSec = startMs ? Math.max(1, (Date.now() - startMs) / 1000) : 0;
  const ratePerMin = elapsedSec > 0 ? Math.round((done / elapsedSec) * 60) : 0;
  const remaining = Math.max(0, total - done);
  const etaSec = ratePerMin > 0 ? Math.round((remaining / ratePerMin) * 60) : 0;
  const etaLabel = etaSec > 0
    ? etaSec >= 60
      ? `~${Math.round(etaSec / 60)} min left`
      : `~${etaSec}s left`
    : '';

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold">Hugging Face Dataset Importer</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          One-click curated datasets. Cleans HTML, preserves LaTeX, extracts subject/chapter/exam/session/year per row.
        </p>
      </div>


      {/* CHOOSE */}
      {step === 'choose' && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Curated Datasets
              </CardTitle>
              <CardDescription>Verified, chapter-mapped. One click.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {PRESETS.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">{p.description}</div>
                    </div>
                    <Badge variant="secondary">{p.expectedRows.toLocaleString()}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={previewing} onClick={() => peek(p.datasetPath, p.split)} className="flex-1 min-w-[140px]">
                      {previewing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                      Preview Sample
                    </Button>
                    <Button size="sm" onClick={() => startImport(p)} className="flex-1 min-w-[110px]">
                      <Database className="h-3.5 w-3.5 mr-1.5" /> Import
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startDemoImport(p)} className="flex-1 min-w-[100px]">
                      Demo (2k)
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custom Dataset</CardTitle>
              <CardDescription>
                Paste any Hugging Face dataset path (e.g. <span className="font-mono">owner/dataset-name</span>).
                We'll fetch the schema, show what will happen, then let you import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Dataset Path</Label>
                <Input
                  placeholder="owner/dataset-name"
                  value={datasetPath}
                  onChange={(e) => setDatasetPath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && peek(datasetPath, split)}
                />
              </div>
              <Button onClick={() => peek(datasetPath, split)} className="w-full" disabled={previewing || !datasetPath.trim()}>
                {previewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Preview Dataset
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PREVIEW */}
      {step === 'preview' && preview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" /> Cleaned Preview — {datasetPath}
            </CardTitle>
            <CardDescription>{preview.totalRows?.toLocaleString() ?? '?'} rows total.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PlainEnglishSummary preview={preview} datasetPath={datasetPath} />
            {preview.cleanedSample && (
              <div className="rounded-lg border p-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <Field label="Subject" value={preview.cleanedSample.subject} />
                  <Field label="Chapter" value={preview.cleanedSample.chapter} />
                  <Field label="Chapter Slug" value={preview.cleanedSample.chapter_slug} mono />
                  <Field label="Exam Tag" value={preview.cleanedSample.exam} />
                  <Field label="PYQ Exam" value={preview.cleanedSample.pyq_exam} />
                  <Field label="Session" value={preview.cleanedSample.session} />
                  <Field label="Year" value={preview.cleanedSample.year ?? '—'} />
                  <Field label="Paper" value={preview.cleanedSample.paper ?? '—'} />
                  <Field label="Source" value={preview.cleanedSample.source} mono />
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">Question (rendered)</div>
                  <div className="leading-relaxed">
                    <MathDisplay text={preview.cleanedSample.question} block />
                  </div>
                </div>
                {preview.cleanedSample.options && (
                  <div className="grid md:grid-cols-2 gap-2 pt-2 border-t">
                    {(['a', 'b', 'c', 'd'] as const).map((k) => {
                      const isCorrect = String(preview.cleanedSample.correct ?? '').toLowerCase() === k;
                      return (
                        <div
                          key={k}
                          className={`text-xs flex gap-2 rounded-md border p-2 ${
                            isCorrect ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : ''
                          }`}
                        >
                          <span className="font-semibold">{k.toUpperCase()}.</span>
                          <span className="flex-1"><MathDisplay text={preview.cleanedSample.options[k]} /></span>
                          {isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="text-xs">
                  <span className="font-semibold">Correct:</span> {preview.cleanedSample.correct ?? '—'}
                </div>
                {preview.cleanedSample.explanation && (
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Explanation (rendered)</div>
                    <div className="text-xs leading-relaxed">
                      <MathDisplay text={preview.cleanedSample.explanation} block />
                    </div>
                  </div>
                )}
              </div>
            )}
            {preview.columnsReport && (
              <details className="rounded-lg border p-3" open>
                <summary className="font-medium text-sm cursor-pointer">
                  Columns: {preview.columnsReport.used?.length ?? 0} used, {preview.columnsReport.skipped?.length ?? 0} skipped
                </summary>
                <div className="mt-3 space-y-3 text-xs">
                  <div>
                    <div className="font-semibold mb-1 text-emerald-600">Used columns</div>
                    <ul className="space-y-1">
                      {(preview.columnsReport.used ?? []).map((u: any) => (
                        <li key={u.column}>
                          <span className="font-mono">{u.column}</span> — {u.mapsTo}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {preview.columnsReport.skipped?.length > 0 && (
                    <div>
                      <div className="font-semibold mb-1 text-amber-600">Skipped columns</div>
                      <div className="font-mono">{preview.columnsReport.skipped.join(", ")}</div>
                    </div>
                  )}
                </div>
              </details>
            )}
            <details className="rounded-lg border p-3">
              <summary className="font-medium text-sm cursor-pointer">Original HF row</summary>
              <pre className="mt-2 text-xs overflow-auto max-h-60 bg-muted p-2 rounded whitespace-pre-wrap">
                {JSON.stringify(preview.sampleRows?.[0] ?? {}, null, 2)}
              </pre>
            </details>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Back</Button>
              {(() => {
                const matchingPreset = PRESETS.find((p) => p.datasetPath === datasetPath);
                if (matchingPreset) {
                  return (
                    <Button className="flex-1" onClick={() => startImport(matchingPreset)}>
                      Looks good — Start Import
                    </Button>
                  );
                }
                // Custom dataset — build an on-the-fly preset.
                return (
                  <Button
                    className="flex-1"
                    onClick={() => startImport({
                      id: datasetPath,
                      label: datasetPath,
                      description: 'Custom dataset',
                      datasetPath,
                      split,
                      expectedRows: preview?.totalRows ?? 0,
                      datasetProfile: 'generic',
                      jeeOnly: false,
                    })}
                  >
                    Start Import ({(preview?.totalRows ?? 0).toLocaleString()} rows)
                  </Button>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* RUNNING */}
      {step === 'running' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Importing in background…
            </CardTitle>
            <CardDescription>This can take a few minutes for large datasets. Safe to leave this page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>{(job?.imported ?? 0).toLocaleString()} imported · {(job?.skipped ?? 0).toLocaleString()} skipped</span>
                <span>{pct}% of {total.toLocaleString()}</span>
              </div>
              <Progress value={pct} />
              <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                <span>{ratePerMin > 0 ? `${ratePerMin.toLocaleString()} rows/min` : 'Warming up…'}</span>
                <span>{etaLabel}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <Stat label="Imported" value={job?.imported ?? 0} accent />
              <Stat label="Skipped" value={job?.skipped ?? 0} />
              <Stat label="Chapters" value={job?.chapters_created ?? 0} />
              <Stat label="Topics" value={job?.topics_created ?? 0} />
            </div>
            <SkipReasonsPanel reasons={job?.skip_reasons} />
            <Button variant="outline" onClick={cancel} className="w-full">
              <X className="h-4 w-4 mr-2" /> Stop Import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* DONE */}
      {step === 'done' && job && (
        <Card className={job.status === 'completed' ? 'border-green-200' : 'border-destructive/40'}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {job.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              Import {job.status}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.error && (
              <Alert variant="destructive">
                <AlertDescription>{job.error}</AlertDescription>
              </Alert>
            )}
            <div className="grid md:grid-cols-4 gap-3">
              <Stat label="Imported" value={job.imported} accent />
              <Stat label="Skipped" value={job.skipped} />
              <Stat label="Chapters" value={job.chapters_created} />
              <Stat label="Topics" value={job.topics_created} />
            </div>
            <SkipReasonsPanel reasons={job.skip_reasons} />
            <div className="rounded-lg border p-3 text-xs text-muted-foreground">
              Imported rows are attached to real chapters automatically. New chapters are created when needed; there is no Misc bucket in the import flow.
            </div>
            <Button onClick={reset} className="w-full">Import Another</Button>
            {demoSourceTag ? (
              <Button onClick={() => revertDemoImport(demoSourceTag)} className="w-full" variant="destructive">
                Revert Demo Import
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{String(value ?? '—')}</div>
    </div>
  );
}

function PlainEnglishSummary({ preview, datasetPath }: { preview: any; datasetPath: string }) {
  const total = Number(preview?.totalRows || 0);
  const used = preview?.columnsReport?.used || [];
  const skipped = preview?.columnsReport?.skipped || [];
  const subject = preview?.cleanedSample?.subject;
  const chapter = preview?.cleanedSample?.chapter;
  const exam = preview?.cleanedSample?.pyq_exam || preview?.cleanedSample?.exam;
  const hasOptions = !!preview?.cleanedSample?.options;
  const hasAnswer = !!preview?.cleanedSample?.correct;
  const hasExplanation = !!preview?.cleanedSample?.explanation;
  // ~30 rows/sec target throughput → minutes estimate
  const minutes = Math.max(1, Math.ceil(total / 30 / 60));

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        What will happen if you click Import
      </div>
      <ul className="space-y-2 text-sm leading-relaxed text-foreground">
        <li>
          <span className="font-semibold">{total.toLocaleString()}</span> questions will be read from
          <span className="font-mono text-xs mx-1 px-1.5 py-0.5 rounded bg-muted">{datasetPath}</span>.
        </li>
        <li>
          For each question, we'll keep:
          <span className="ml-1">
            text{hasOptions ? ', options A–D' : ''}{hasAnswer ? ', correct answer' : ''}
            {hasExplanation ? ', explanation' : ''}, and any LaTeX/math.
          </span>
        </li>
        <li>
          Each question will be assigned to a subject (Physics / Chemistry / Maths / Biology) and a chapter.
          {subject || chapter ? <> Sample row: <span className="font-medium">{subject || '?'} → {chapter || '?'}</span></> : null}
          {exam ? <>, exam: <span className="font-medium">{String(exam).toUpperCase()}</span></> : null}.
        </li>
        <li>
          If a chapter doesn't already exist, a new one is created automatically under the right subject and exam batch.
        </li>
        <li>
          Estimated time: <span className="font-medium">~{minutes} min</span>. You can leave this page — it runs in the background.
        </li>
        <li className="text-xs text-muted-foreground pt-1">
          {used.length} column{used.length === 1 ? '' : 's'} will be used
          {skipped.length > 0 ? `, ${skipped.length} ignored` : ''}.
          Nothing is overwritten — existing questions are skipped if already imported.
        </li>
      </ul>
    </div>
  );
}

function SkipReasonsPanel({ reasons }: { reasons?: Record<string, number> | null }) {
  const entries = Object.entries(reasons || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 space-y-1.5">
      <div className="text-xs font-semibold text-amber-900">Skip reasons (why some rows were not imported)</div>
      <div className="space-y-1">
        {entries.map(([reason, count]) => (
          <div key={reason} className="flex items-start justify-between gap-3 text-xs">
            <span className="font-mono text-amber-900 break-all">{reason}</span>
            <span className="font-semibold text-amber-900 tabular-nums">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? 'border-green-300' : ''}`}>
      <div className={`text-2xl font-bold ${accent ? 'text-green-700' : ''}`}>
        {Number(value || 0).toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { QuestionLivePreview } from '@/components/admin/QuestionLivePreview';

const TEMPLATE_HEADERS = [
  'subject',
  'chapter',
  'topic',
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_answer',
  'question_type',
  'difficulty',
  'explanation',
  'is_pyq',
  'pyq_year',
] as const;

const TEMPLATE_ROWS = [
  [
    'Physics',
    'Motion',
    'Equations of Motion',
    'A body starts from rest and accelerates at 2 m/s$^2$. Find its velocity after 5 s.',
    '5 m/s',
    '10 m/s',
    '15 m/s',
    '20 m/s',
    'B',
    'single_correct',
    'Easy',
    'v = u + at = 0 + 2 × 5 = 10 m/s',
    'no',
    '',
  ],
  [
    'Chemistry',
    'Atomic Structure',
    'Dalton\'s Theory',
    'Which of the following is NOT a postulate of Dalton\'s atomic theory?',
    'Atoms are indivisible',
    'Atoms of same element are identical',
    'Atoms combine in simple ratios',
    'Atoms can be created in a reaction',
    'D',
    'single_correct',
    'Easy',
    'Dalton stated atoms cannot be created or destroyed.',
    'no',
    '',
  ],
];

const MAX_ROWS = 500;

interface Batch { id: string; name: string; exam_type: string; grade: number }
interface ChapterRow { id: string; chapter_name: string; subject: string; batch_id: string | null }

interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  subject: string;
  chapter: string;
  topic: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  question_type: string;
  difficulty: string;
  explanation: string;
  is_pyq: boolean;
  pyq_year: number | null;
  chapterId: string | null;
  errors: string[];
}

const norm = (v: unknown) => String(v ?? '').trim();

export function BulkCsvUploader() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<string>('');
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('batches')
        .select('id, name, exam_type, grade')
        .eq('is_active', true)
        .order('grade');
      setBatches((data as Batch[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!batchId) { setChapters([]); return; }
    (async () => {
      const { data } = await supabase
        .from('chapters')
        .select('id, chapter_name, subject, batch_id')
        .eq('batch_id', batchId)
        .eq('is_active', true);
      setChapters((data as ChapterRow[]) || []);
    })();
  }, [batchId]);

  const downloadTemplate = useCallback(() => {
    const csv = Papa.unparse({ fields: [...TEMPLATE_HEADERS], data: TEMPLATE_ROWS });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jeenie-questions-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const validateRow = useCallback(
    (raw: Record<string, string>, index: number, chapterList: ChapterRow[]): ParsedRow => {
      const errors: string[] = [];
      const get = (k: string) => norm(raw[k] ?? raw[k.toUpperCase()] ?? raw[k.replace(/_/g, ' ')]);

      const subject = get('subject');
      const chapter = get('chapter');
      const question = get('question');
      const questionType = (get('question_type') || 'single_correct').toLowerCase();
      const isNumerical = questionType.includes('num');
      const correct = get('correct_answer').toUpperCase();

      if (!question) errors.push('Question is empty');
      if (!subject) errors.push('Subject missing');
      if (!chapter) errors.push('Chapter missing');

      if (!isNumerical) {
        (['option_a', 'option_b', 'option_c', 'option_d'] as const).forEach((k) => {
          if (!get(k)) errors.push(`${k.replace('_', ' ').toUpperCase()} missing`);
        });
        if (!correct) errors.push('Correct answer missing');
        else if (!/^[A-D](,[A-D])*$/.test(correct)) errors.push('Correct answer must be A/B/C/D');
      } else if (!correct) {
        errors.push('Numerical answer missing');
      }

      const matched = chapterList.find(
        (c) =>
          c.chapter_name.toLowerCase() === chapter.toLowerCase() &&
          (!subject || c.subject.toLowerCase() === subject.toLowerCase())
      );
      if (chapter && !matched) errors.push(`Chapter "${chapter}" not found in selected batch`);

      const difficultyRaw = get('difficulty').toLowerCase();
      const difficulty = difficultyRaw
        ? difficultyRaw.charAt(0).toUpperCase() + difficultyRaw.slice(1)
        : 'Medium';
      if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) errors.push('Difficulty must be Easy/Medium/Hard');

      const yearRaw = get('pyq_year');
      const pyqYear = yearRaw ? Number(yearRaw) : null;
      if (yearRaw && (!Number.isFinite(pyqYear) || (pyqYear as number) < 1990)) errors.push('Invalid PYQ year');

      return {
        index,
        raw,
        subject,
        chapter,
        topic: get('topic'),
        question,
        option_a: get('option_a'),
        option_b: get('option_b'),
        option_c: get('option_c'),
        option_d: get('option_d'),
        correct_answer: correct,
        question_type: questionType,
        difficulty,
        explanation: get('explanation'),
        is_pyq: /^(yes|true|1)$/i.test(get('is_pyq')) || !!yearRaw,
        pyq_year: pyqYear,
        chapterId: matched?.id || null,
        errors,
      };
    },
    []
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!batchId) {
        toast.error('Pehle batch select karo');
        return;
      }
      setLoading(true);
      setFileName(file.name);
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
        complete: (result) => {
          const data = (result.data || []).slice(0, MAX_ROWS);
          const seen = new Set<string>();
          const parsed = data.map((raw, i) => {
            const row = validateRow(raw, i, chapters);
            const key = row.question.toLowerCase().replace(/\s+/g, ' ');
            if (key && seen.has(key)) row.errors.push('Duplicate question in this file');
            if (key) seen.add(key);
            return row;
          });
          setRows(parsed);
          setSelectedIndex(0);
          setLoading(false);
          if ((result.data || []).length > MAX_ROWS) {
            toast.warning(`Sirf pehle ${MAX_ROWS} rows load kiye. File ko chhote parts mein todo.`);
          }
        },
        error: (err) => {
          logger.error('CSV parse failed', err);
          toast.error('CSV parse nahi ho payi');
          setLoading(false);
        },
      });
    },
    [batchId, chapters, validateRow]
  );

  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;
  const selected = rows[selectedIndex];
  const selectedBatch = batches.find((b) => b.id === batchId);

  const submitToQueue = useCallback(async () => {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      const payload = validRows.map((r) => ({
        source_file: fileName || 'csv-upload',
        raw_data: r.raw as unknown as Record<string, unknown>,
        status: 'pending' as const,
        parsed_question: {
          question: r.question,
          option_a: r.option_a,
          option_b: r.option_b,
          option_c: r.option_c,
          option_d: r.option_d,
          correct_option: r.correct_answer,
          explanation: r.explanation,
          subject: r.subject,
          chapter: r.chapter,
          topic: r.topic,
          difficulty: r.difficulty,
          exam: selectedBatch?.exam_type === 'Foundation'
            ? `Foundation-${selectedBatch?.grade}`
            : selectedBatch?.exam_type || 'JEE',
          question_type: r.question_type,
          is_pyq: r.is_pyq,
          pyq_year: r.pyq_year,
          auto_assigned_chapter_id: r.chapterId,
          auto_assigned_chapter_name: r.chapter,
          assignment_method: 'manual' as const,
          confidence_score: 100,
        } as unknown as Record<string, unknown>,
      }));

      const chunkSize = 100;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const { error } = await supabase
          .from('extracted_questions_queue')
          .insert(payload.slice(i, i + chunkSize) as never);
        if (error) throw error;
      }

      toast.success(`${validRows.length} questions review queue mein bhej diye`);
      setRows([]);
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      logger.error('CSV queue insert failed', error);
      toast.error('Queue mein bhejne mein error aaya');
    } finally {
      setSubmitting(false);
    }
  }, [validRows, fileName, selectedBatch]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Bulk CSV Upload
          </CardTitle>
          <CardDescription>
            Smart Work: Template fill karo aur upload karo. Ye best way hai large datasets (MTG Foundation type) ko handle karne ka. Review ke baad live honge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger className={!batchId ? "border-amber-500 animate-pulse" : ""}>
                  <SelectValue placeholder="Select batch (Grade 6-10 / JEE / NEET)" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Foundation (6-10)</div>
                  {batches.filter(b => b.exam_type === 'Foundation').map((b) => (
                    <SelectItem key={b.id} value={b.id}>Grade {b.grade} Foundation</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 border-t">Higher Secondary (11-12)</div>
                  {batches.filter(b => b.exam_type !== 'Foundation').map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Download CSV template
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Upload filled CSV</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button
                className="w-full"
                disabled={!batchId || loading}
                onClick={() => fileRef.current?.click()}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload CSV
              </Button>
            </div>
          </div>

          {batchId && chapters.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Is batch mein koi chapter nahi hai — pehle chapters add karo.</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{rows.length} rows</Badge>
              <Badge className="bg-green-600">{validRows.length} valid</Badge>
              {invalidCount > 0 && <Badge variant="destructive">{invalidCount} with errors</Badge>}
              <Button
                className="ml-auto"
                disabled={validRows.length === 0 || submitting}
                onClick={submitToQueue}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Send {validRows.length} to Review Queue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rows</CardTitle>
              <CardDescription>Row pe click karo — right side live preview dikhega</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[560px] pr-3">
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedIndex(i)}
                      className={`w-full text-left rounded-md border p-2 transition-colors ${
                        i === selectedIndex ? 'border-primary bg-accent' : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">#{i + 1}</Badge>
                        <span className="text-xs text-muted-foreground truncate">
                          {r.subject} • {r.chapter || '—'}
                        </span>
                        {r.errors.length === 0 ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 ml-auto" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive ml-auto" />
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{r.question || '(empty question)'}</p>
                      {r.errors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.errors.map((e) => (
                            <Badge key={e} variant="destructive" className="text-[10px]">{e}</Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {selected && (
              <>
                <QuestionLivePreview
                  question={{
                    question: selected.question,
                    option_a: selected.option_a,
                    option_b: selected.option_b,
                    option_c: selected.option_c,
                    option_d: selected.option_d,
                    correct_option: selected.correct_answer,
                    explanation: selected.explanation,
                  }}
                />
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Raw text (as in CSV)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
                      {selected.question}
                    </pre>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BulkCsvUploader;

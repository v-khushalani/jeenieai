import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle, FileSpreadsheet, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { QuestionLivePreview } from '@/components/admin/QuestionLivePreview';

/**
 * Full CSV template. Image columns accept EITHER a direct https URL
 * OR a plain filename (e.g. q101.png) that is matched against the
 * image folder the admin drops in alongside the sheet.
 */
const TEMPLATE_HEADERS = [
  'grade',
  'subject',
  'chapter',
  'topic',
  'question_type',
  'difficulty',
  'question',
  'question_image',
  'option_a',
  'option_a_image',
  'option_b',
  'option_b_image',
  'option_c',
  'option_c_image',
  'option_d',
  'option_d_image',
  'correct_answer',
  'numerical_answer',
  'numerical_tolerance',
  'explanation',
  'explanation_image',
  'is_pyq',
  'pyq_year',
  'pyq_exam',
  'exam_relevance',
  'source',
] as const;

const TEMPLATE_ROWS: string[][] = [
  [
    '9', 'Physics', 'Motion', 'Equations of Motion', 'single_correct', 'Easy',
    'A body starts from rest and accelerates at 2 m/s$^2$. Find its velocity after 5 s.', '',
    '5 m/s', '', '10 m/s', '', '15 m/s', '', '20 m/s', '',
    'B', '', '',
    'v = u + at = 0 + 2 x 5 = 10 m/s', '',
    'no', '', '', '', 'MTG Foundation',
  ],
  [
    '10', 'Chemistry', 'Acids Bases and Salts', 'Indicators', 'single_correct', 'Medium',
    'Identify the setup shown in the diagram.', 'q_setup_101.png',
    'Titration', 'opt_a_101.png', 'Distillation', 'opt_b_101.png', 'Filtration', '', 'Sublimation', '',
    'A', '', '',
    'The burette and conical flask indicate a titration setup.', 'exp_101.png',
    'no', '', '', '', 'Target Publications',
  ],
  [
    '11', 'Mathematics', 'Quadratic Equations', 'Roots', 'numerical', 'Hard',
    'If $x^2 - 5x + 6 = 0$, find the sum of the roots.', '',
    '', '', '', '', '', '', '', '',
    '', '5', '0.01',
    'Sum of roots = -b/a = 5', '',
    'yes', '2023', 'JEE Main', 'JEE', 'PYQ Bank',
  ],
];

const MAX_ROWS = 2000;
const CHUNK = 100;
const SIGNED_URL_TTL = 315360000; // ~10 years

interface Batch { id: string; name: string; exam_type: string; grade: number }
interface ChapterRow { id: string; chapter_name: string; subject: string; batch_id: string | null }

interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  grade: string;
  subject: string;
  chapter: string;
  topic: string;
  question: string;
  question_image: string;
  option_a: string; option_a_image: string;
  option_b: string; option_b_image: string;
  option_c: string; option_c_image: string;
  option_d: string; option_d_image: string;
  correct_answer: string;
  numerical_answer: number | null;
  numerical_tolerance: number | null;
  explanation: string;
  explanation_image: string;
  question_type: string;
  difficulty: string;
  is_pyq: boolean;
  pyq_year: number | null;
  pyq_exam: string;
  exam_relevance: string;
  source: string;
  chapterId: string | null;
  needsChapterCreate: boolean;
  errors: string[];
  warnings: string[];
}

const norm = (v: unknown) => String(v ?? '').trim();
const isUrl = (v: string) => /^https?:\/\//i.test(v);
const baseName = (p: string) => p.split(/[\\/]/).pop()?.toLowerCase() || '';

const IMAGE_FIELDS = [
  'question_image',
  'option_a_image',
  'option_b_image',
  'option_c_image',
  'option_d_image',
  'explanation_image',
] as const;

export function BulkCsvUploader() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState<string>('');
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [images, setImages] = useState<Map<string, File>>(new Map());
  const [autoCreateChapters, setAutoCreateChapters] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const selectedBatch = batches.find((b) => b.id === batchId);

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

  const loadChapters = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('chapters')
      .select('id, chapter_name, subject, batch_id')
      .eq('batch_id', id)
      .eq('is_active', true);
    const list = (data as ChapterRow[]) || [];
    setChapters(list);
    return list;
  }, []);

  useEffect(() => {
    if (!batchId) { setChapters([]); return; }
    loadChapters(batchId);
  }, [batchId, loadChapters]);

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
    (raw: Record<string, string>, index: number, chapterList: ChapterRow[], imageMap: Map<string, File>, batch?: Batch): ParsedRow => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const get = (k: string) => norm(raw[k] ?? raw[k.toUpperCase()] ?? raw[k.replace(/_/g, ' ')]);

      const grade = get('grade');
      const subject = get('subject');
      const chapter = get('chapter');
      const question = get('question');
      const questionType = (get('question_type') || 'single_correct').toLowerCase();
      const isNumerical = questionType.includes('num') || questionType.includes('integer');
      const isMulti = questionType.includes('multi');
      const correct = get('correct_answer').toUpperCase().replace(/\s/g, '');

      const imgVals: Record<string, string> = {};
      IMAGE_FIELDS.forEach((f) => {
        const v = get(f);
        imgVals[f] = v;
        if (v && !isUrl(v) && !imageMap.has(baseName(v))) {
          errors.push(`Image "${v}" not found in uploaded folder`);
        }
      });

      if (!question && !imgVals.question_image) errors.push('Question is empty');
      if (!subject) errors.push('Subject missing');
      if (!chapter) errors.push('Chapter missing');

      if (grade && batch && Number(grade) !== batch.grade) {
        errors.push(`Row grade ${grade} does not match selected batch (Grade ${batch.grade})`);
      }

      let numericalAnswer: number | null = null;
      let numericalTolerance: number | null = null;

      if (isNumerical) {
        const na = get('numerical_answer') || correct;
        numericalAnswer = na === '' ? null : Number(na);
        if (numericalAnswer === null || !Number.isFinite(numericalAnswer)) errors.push('Numerical answer missing/invalid');
        const tol = get('numerical_tolerance');
        numericalTolerance = tol ? Number(tol) : null;
      } else {
        (['option_a', 'option_b'] as const).forEach((k) => {
          if (!get(k) && !imgVals[`${k}_image`]) errors.push(`${k.replace('_', ' ').toUpperCase()} missing`);
        });
        if (!get('option_c') && !imgVals.option_c_image) warnings.push('Option C empty');
        if (!get('option_d') && !imgVals.option_d_image) warnings.push('Option D empty');
        if (!correct) errors.push('Correct answer missing');
        else if (!/^[A-D](,[A-D])*$/.test(correct)) errors.push('Correct answer must be A/B/C/D (comma separated for multi)');
        else if (!isMulti && correct.includes(',')) errors.push('Multiple answers given but type is not multi_correct');
      }

      const matched = chapterList.find(
        (c) =>
          (c.chapter_name || '').toLowerCase() === chapter.toLowerCase() &&
          (!subject || (c.subject || '').toLowerCase() === subject.toLowerCase())
      );
      let needsChapterCreate = false;
      if (chapter && !matched) {
        if (autoCreateChapters) { needsChapterCreate = true; warnings.push('New chapter will be created'); }
        else errors.push(`Chapter "${chapter}" not found in selected batch`);
      }

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
        grade,
        subject,
        chapter,
        topic: get('topic'),
        question,
        question_image: imgVals.question_image,
        option_a: get('option_a'), option_a_image: imgVals.option_a_image,
        option_b: get('option_b'), option_b_image: imgVals.option_b_image,
        option_c: get('option_c'), option_c_image: imgVals.option_c_image,
        option_d: get('option_d'), option_d_image: imgVals.option_d_image,
        correct_answer: correct,
        numerical_answer: numericalAnswer,
        numerical_tolerance: numericalTolerance,
        explanation: get('explanation'),
        explanation_image: imgVals.explanation_image,
        question_type: isNumerical ? 'numerical' : isMulti ? 'multiple_correct' : 'single_correct',
        difficulty,
        is_pyq: /^(yes|true|1)$/i.test(get('is_pyq')) || !!yearRaw,
        pyq_year: pyqYear,
        pyq_exam: get('pyq_exam'),
        exam_relevance: get('exam_relevance'),
        source: get('source') || 'csv_upload',
        chapterId: matched?.id || null,
        needsChapterCreate,
        errors,
        warnings,
      };
    },
    [autoCreateChapters]
  );

  const ingestRows = useCallback(
    (data: Record<string, string>[], name: string) => {
      const sliced = data.slice(0, MAX_ROWS);
      const seen = new Set<string>();
      const parsed = sliced.map((raw, i) => {
        const row = validateRow(raw, i, chapters, images, selectedBatch);
        const key = row.question.toLowerCase().replace(/\s+/g, ' ');
        if (key && seen.has(key)) row.errors.push('Duplicate question in this file');
        if (key) seen.add(key);
        return row;
      });
      setRows(parsed);
      setFileName(name);
      setSelectedIndex(0);
      setLoading(false);
      if (data.length > MAX_ROWS) {
        toast.warning(`Only the first ${MAX_ROWS} rows were loaded. Split the file into smaller parts.`);
      }
    },
    [chapters, images, selectedBatch, validateRow]
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!batchId) { toast.error('Select a batch first'); return; }
      setLoading(true);

      if (/\.(xlsx|xls)$/i.test(file.name)) {
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
          const normalised = json.map((r) => {
            const out: Record<string, string> = {};
            Object.entries(r).forEach(([k, v]) => {
              out[k.trim().toLowerCase().replace(/\s+/g, '_')] = String(v ?? '');
            });
            return out;
          });
          ingestRows(normalised, file.name);
        } catch (err) {
          logger.error('XLSX parse failed', err);
          toast.error('Excel file could not be read');
          setLoading(false);
        }
        return;
      }

      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
        complete: (result) => ingestRows(result.data || [], file.name),
        error: (err) => {
          logger.error('CSV parse failed', err);
          toast.error('CSV could not be parsed');
          setLoading(false);
        },
      });
    },
    [batchId, ingestRows]
  );

  const handleImageFolder = useCallback((files: FileList | null) => {
    if (!files) return;
    const map = new Map<string, File>();
    Array.from(files).forEach((f) => {
      if (/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)) map.set(f.name.toLowerCase(), f);
    });
    setImages(map);
    toast.success(`${map.size} images ready`);
  }, []);

  // Re-validate whenever images / chapters / auto-create change
  useEffect(() => {
    if (rows.length === 0) return;
    setRows((prev) => prev.map((r) => validateRow(r.raw, r.index, chapters, images, selectedBatch)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, chapters, autoCreateChapters]);

  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidCount = rows.length - validRows.length;
  const selected = rows[selectedIndex];

  const uploadImage = useCallback(async (value: string, cache: Map<string, string>): Promise<string | null> => {
    if (!value) return null;
    if (isUrl(value)) return value;
    const key = baseName(value);
    if (cache.has(key)) return cache.get(key)!;
    const file = images.get(key);
    if (!file) return null;
    const path = `${batchId}/${Date.now()}-${key}`;
    const { error } = await supabase.storage.from('question-images').upload(path, file, { upsert: true });
    if (error) { logger.error('Image upload failed', error); return null; }
    const { data } = await supabase.storage.from('question-images').createSignedUrl(path, SIGNED_URL_TTL);
    const url = data?.signedUrl || null;
    if (url) cache.set(key, url);
    return url;
  }, [batchId, images]);

  const submitToQueue = useCallback(async () => {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      // 1. Create any missing chapters
      let chapterList = chapters;
      const missing = Array.from(
        new Map(
          validRows.filter((r) => r.needsChapterCreate).map((r) => [`${r.subject}|${r.chapter}`.toLowerCase(), r])
        ).values()
      );
      if (missing.length > 0) {
        setProgress(`Creating ${missing.length} chapters...`);
        const { error } = await supabase.from('chapters').insert(
          missing.map((r) => ({
            chapter_name: r.chapter,
            name: r.chapter,
            subject: r.subject,
            batch_id: batchId,
            class_level: selectedBatch?.grade ?? null,
            is_active: true,
          })) as never
        );
        if (error) throw error;
        chapterList = await loadChapters(batchId);
      }

      const findChapterId = (r: ParsedRow) =>
        r.chapterId ||
        chapterList.find(
          (c) => (c.chapter_name || '').toLowerCase() === r.chapter.toLowerCase() &&
            (c.subject || '').toLowerCase() === r.subject.toLowerCase()
        )?.id || null;

      // 2. Upload images
      const cache = new Map<string, string>();
      const imageRows: Record<string, string | null>[] = [];
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        if (IMAGE_FIELDS.some((f) => r[f])) setProgress(`Uploading images ${i + 1}/${validRows.length}...`);
        imageRows.push({
          question_image_url: await uploadImage(r.question_image, cache),
          option_a_image_url: await uploadImage(r.option_a_image, cache),
          option_b_image_url: await uploadImage(r.option_b_image, cache),
          option_c_image_url: await uploadImage(r.option_c_image, cache),
          option_d_image_url: await uploadImage(r.option_d_image, cache),
          explanation_image_url: await uploadImage(r.explanation_image, cache),
        });
      }

      // 3. Queue rows for review
      setProgress('Sending to review queue...');
      const examType = selectedBatch?.exam_type === 'Foundation'
        ? `Foundation-${selectedBatch?.grade}`
        : selectedBatch?.exam_type || 'JEE';

      const payload = validRows.map((r, i) => ({
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
          numerical_answer: r.numerical_answer,
          numerical_tolerance: r.numerical_tolerance,
          explanation: r.explanation,
          subject: r.subject,
          chapter: r.chapter,
          topic: r.topic,
          difficulty: r.difficulty,
          class_level: selectedBatch?.grade ?? (r.grade ? Number(r.grade) : null),
          exam: examType,
          question_type: r.question_type,
          is_pyq: r.is_pyq,
          pyq_year: r.pyq_year,
          pyq_exam: r.pyq_exam || null,
          exam_relevance: r.exam_relevance ? r.exam_relevance.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : null,
          source: r.source,
          ...imageRows[i],
          auto_assigned_chapter_id: findChapterId(r),
          auto_assigned_chapter_name: r.chapter,
          assignment_method: 'manual' as const,
          confidence_score: 100,
        } as unknown as Record<string, unknown>,
      }));

      for (let i = 0; i < payload.length; i += CHUNK) {
        setProgress(`Saving ${Math.min(i + CHUNK, payload.length)}/${payload.length}...`);
        const { error } = await supabase
          .from('extracted_questions_queue')
          .insert(payload.slice(i, i + CHUNK) as never);
        if (error) throw error;
      }

      toast.success(`${validRows.length} questions sent to the review queue`);
      setRows([]);
      setFileName('');
      setImages(new Map());
      if (fileRef.current) fileRef.current.value = '';
      if (imgRef.current) imgRef.current.value = '';
    } catch (error) {
      logger.error('CSV queue insert failed', error);
      toast.error('Something went wrong while saving');
    } finally {
      setProgress('');
      setSubmitting(false);
    }
  }, [validRows, fileName, selectedBatch, chapters, batchId, loadChapters, uploadImage]);

  const previewUrl = useCallback((value: string) => {
    if (!value) return null;
    if (isUrl(value)) return value;
    const f = images.get(baseName(value));
    return f ? URL.createObjectURL(f) : null;
  }, [images]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Bulk question upload (CSV / Excel)
          </CardTitle>
          <CardDescription>
            Works for Grade 6-10 Foundation and Grade 11-12. Diagrams are supported for the question, every option and the explanation.
            Everything lands in the review queue first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger className={!batchId ? 'border-amber-500' : ''}>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Foundation (6-10)</div>
                  {batches.filter((b) => b.exam_type === 'Foundation').map((b) => (
                    <SelectItem key={b.id} value={b.id}>Grade {b.grade} Foundation</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 border-t">Higher Secondary (11-12)</div>
                  {batches.filter((b) => b.exam_type !== 'Foundation').map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <Button variant="outline" className="w-full" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Download template
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Diagram folder (optional)</Label>
              <input
                ref={imgRef}
                type="file"
                multiple
                // @ts-expect-error non-standard directory attributes
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={(e) => handleImageFolder(e.target.files)}
              />
              <Button variant="outline" className="w-full" onClick={() => imgRef.current?.click()}>
                <ImageIcon className="h-4 w-4 mr-2" />
                {images.size > 0 ? `${images.size} images loaded` : 'Choose image folder'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Upload filled sheet</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button className="w-full" disabled={!batchId || loading} onClick={() => fileRef.current?.click()}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload CSV / Excel
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch checked={autoCreateChapters} onCheckedChange={setAutoCreateChapters} id="auto-chapters" />
            <Label htmlFor="auto-chapters" className="cursor-pointer text-sm font-normal">
              Create chapters automatically if the name is not in this batch yet
            </Label>
          </div>

          {batchId && chapters.length === 0 && !autoCreateChapters && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>This batch has no chapters yet — enable auto-create or add chapters first.</AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{rows.length} rows</Badge>
              <Badge className="bg-green-600">{validRows.length} valid</Badge>
              {invalidCount > 0 && <Badge variant="destructive">{invalidCount} with errors</Badge>}
              {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
              <Button className="ml-auto" disabled={validRows.length === 0 || submitting} onClick={submitToQueue}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Send {validRows.length} to review queue
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
              <CardDescription>Click a row to see exactly what the student will see</CardDescription>
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
                      <p className="text-sm line-clamp-2">{r.question || '(image-only question)'}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.errors.map((e) => (
                          <Badge key={e} variant="destructive" className="text-[10px]">{e}</Badge>
                        ))}
                        {r.warnings.map((w) => (
                          <Badge key={w} variant="outline" className="text-[10px]">{w}</Badge>
                        ))}
                      </div>
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
                    question_image_url: previewUrl(selected.question_image),
                    option_a: selected.option_a,
                    option_a_image_url: previewUrl(selected.option_a_image),
                    option_b: selected.option_b,
                    option_b_image_url: previewUrl(selected.option_b_image),
                    option_c: selected.option_c,
                    option_c_image_url: previewUrl(selected.option_c_image),
                    option_d: selected.option_d,
                    option_d_image_url: previewUrl(selected.option_d_image),
                    correct_option: selected.correct_answer,
                    explanation: selected.explanation,
                    explanation_image_url: previewUrl(selected.explanation_image),
                  }}
                />
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Raw text (as in the sheet)</CardTitle>
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

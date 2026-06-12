// HF Aligned Importer
// ---------------------------------------------------------------
// Streams rows from a small, curated set of Hugging Face datasets
// (MathQA, SciQ, OpenBookQA) and writes them into `public.questions`
// already aligned to our schema:
//   - batch (Foundation grade 6-10), subject, chapter (auto-created)
//   - option_a..d, correct_option, explanation, difficulty
//   - source attribution + content_hash for dedupe
//
// AI is only used for SciQ (subject + chapter), batched.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const HF = "https://datasets-server.huggingface.co";
const PAGE_SIZE = 100; // HF rows API hard cap
const PROCESS_CHUNK_SIZE = 200; // keep each edge invocation comfortably under runtime limits

// ---------- Dataset definitions ----------
type DatasetKey = "math-qa" | "sciq" | "openbookqa-main";

interface DatasetDef {
  datasetPath: string;
  config?: string;
  split: string;
  subjectStrategy: "fixed" | "ai";
  chapterStrategy: "field" | "ai" | "constant";
  fixedSubject?: string;
  defaultGrade: number;
  defaultDifficulty: "Easy" | "Medium" | "Hard";
}

const DATASETS: Record<DatasetKey, DatasetDef> = {
  "math-qa": {
    datasetPath: "shulijia/MNLP_M3_mcqa_dataset_mathqa_orig",
    split: "train",
    subjectStrategy: "fixed",
    chapterStrategy: "field",
    fixedSubject: "Mathematics",
    defaultGrade: 8,
    defaultDifficulty: "Medium",
  },
  "sciq": {
    datasetPath: "allenai/sciq",
    split: "train",
    subjectStrategy: "ai",
    chapterStrategy: "ai",
    defaultGrade: 8,
    defaultDifficulty: "Medium",
  },
  "openbookqa-main": {
    datasetPath: "allenai/openbookqa",
    config: "main",
    split: "train",
    subjectStrategy: "fixed",
    chapterStrategy: "constant",
    fixedSubject: "Science",
    defaultGrade: 7,
    defaultDifficulty: "Easy",
  },
};

// ---------- Utilities ----------
function slugify(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// ---------- Difficulty classifiers (deterministic, no AI) ----------
type Difficulty = "Easy" | "Medium" | "Hard";

function difficultyMathQA(category: string, rationale: string, problem: string): Difficulty {
  const cat = (category || "").toLowerCase();
  const steps = (rationale.match(/[.,;]/g) || []).length + 1;
  const hardCats = ["probability", "geometry", "physics"];
  const easyCats = ["gain", "general", "other"];
  const numbers = (problem.match(/\d+(\.\d+)?/g) || []).length;
  if (hardCats.includes(cat) || steps >= 6 || rationale.length > 400) return "Hard";
  if (easyCats.includes(cat) && steps <= 3 && numbers <= 4) return "Easy";
  return "Medium";
}

function difficultySciQ(question: string, support: string): Difficulty {
  const qLen = question.length;
  const sLen = support.length;
  const multiClause = (question.match(/,| and | or | which | that /gi) || []).length;
  if (sLen > 300 || qLen > 150 || multiClause >= 3) return "Hard";
  if (sLen < 100 && qLen < 80 && multiClause <= 1) return "Easy";
  return "Medium";
}

function difficultyOpenBookQA(row: any, fact1: string, stem: string): Difficulty {
  // OpenBookQA 'additional' (challenge) split is harder; humanScore when present.
  const hs = Number(row.humanScore ?? row.human_score ?? NaN);
  const clarity = Number(row.clarity ?? NaN);
  if (!Number.isNaN(hs)) {
    if (hs < 0.5) return "Hard";
    if (hs > 0.85) return "Easy";
    return "Medium";
  }
  // Heuristic fallback: long stem + needs reasoning beyond fact1
  if (stem.length > 140 || fact1.length > 120) return "Hard";
  if (stem.length < 70 && !Number.isNaN(clarity) && clarity > 2) return "Easy";
  if (stem.length < 70) return "Easy";
  return "Medium";
}

// ---------- Row -> Normalized Question ----------
interface NormalizedQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
  explanation: string | null;
  subject: string;
  chapterName: string;
  grade: number;
  difficulty: string;
  source: string;
  source_row_id: string;
}

type SkipReasons = Record<string, number>;

function addSkip(reasons: SkipReasons, reason: string, count = 1) {
  if (count <= 0) return;
  reasons[reason] = (reasons[reason] || 0) + count;
}

function mergeSkipReasons(...parts: Array<SkipReasons | null | undefined>): SkipReasons {
  const merged: SkipReasons = {};
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    for (const [k, v] of Object.entries(part)) merged[k] = (merged[k] || 0) + Number(v || 0);
  }
  return merged;
}

// Deterministic chapter classification for MathQA from question text.
function classifyMathChapter(q: string): string {
  const t = q.toLowerCase();
  if (/\b(triangle|circle|square|rectangle|polygon|angle|radius|diameter|perimeter|circumference|area|volume|cube|sphere|cylinder|cone|parallelogram|trapezi|hexagon)\b/.test(t)) return "Geometry";
  if (/\b(probab|chance|dice|coin|random|odds|likelihood)\b/.test(t)) return "Probability";
  if (/\b(percent|interest|profit|loss|discount|cost price|selling price|markup|tax|rupee|dollar|\$)\b/.test(t)) return "Commercial Math";
  if (/\b(speed|distance|km\/h|kmph|mph|train|boat|stream|upstream|downstream|cover)\b/.test(t)) return "Time Speed Distance";
  if (/\b(average|mean|median|mode|standard deviation|variance)\b/.test(t)) return "Statistics";
  if (/\b(ratio|proportion|mixture|alligation)\b/.test(t)) return "Ratio and Proportion";
  if (/\b(equation|solve for|polynomial|quadratic|linear|root|expression|variable|inequality)\b/.test(t)) return "Algebra";
  if (/\b(work|days|men|women|pipe|tank|fill|empty)\b/.test(t)) return "Time and Work";
  if (/\b(age|years old|elder|younger)\b/.test(t)) return "Ages";
  if (/\b(sin|cos|tan|cot|sec|cosec|trigon)\b/.test(t)) return "Trigonometry";
  if (/\b(factor|multiple|prime|divisib|hcf|lcm|gcd)\b/.test(t)) return "Number System";
  if (/\b(series|sequence|progression|ap |gp |arithmetic progression|geometric progression)\b/.test(t)) return "Sequences and Series";
  return "Arithmetic";
}

// Difficulty for MathQA without a `category` field.
function difficultyMathQANoCat(rationale: string, problem: string, chapter: string): Difficulty {
  const steps = (rationale.match(/[.,;]/g) || []).length + 1;
  const numbers = (problem.match(/\d+(\.\d+)?/g) || []).length;
  const hardChapters = ["Probability", "Geometry", "Trigonometry", "Sequences and Series"];
  if (hardChapters.includes(chapter) || steps >= 6 || rationale.length > 400) return "Hard";
  if (steps <= 3 && numbers <= 4 && problem.length < 140) return "Easy";
  return "Medium";
}

// MathQA via shulijia/MNLP_M3_mcqa_dataset_mathqa_orig
// Fields: question (str), choices {text:[], label:["A","B","C","D"]},
//         answerKey (string[]), rationale (str), dataset (str)
function mapMathQA(row: any, def: DatasetDef): NormalizedQuestion | null {
  const problem = String(row.question ?? "").trim();
  const rationale = String(row.rationale ?? "").trim();
  const choices = row.choices;
  const answerKeyRaw = row.answerKey;
  if (!problem || !choices) return null;

  const labels: string[] = (choices.label || []).map((l: any) => String(l).toUpperCase());
  const texts: string[] = (choices.text || []).map((t: any) => String(t).trim());
  if (labels.length !== 4 || texts.length !== 4) return null;

  const byLabel: Record<string, string> = {};
  for (let i = 0; i < labels.length; i++) byLabel[labels[i]] = texts[i];
  if (!byLabel.A || !byLabel.B || !byLabel.C || !byLabel.D) return null;

  let answerKey = "";
  if (Array.isArray(answerKeyRaw)) answerKey = String(answerKeyRaw[0] ?? "").toUpperCase();
  else answerKey = String(answerKeyRaw ?? "").toUpperCase();
  if (!["A", "B", "C", "D"].includes(answerKey)) return null;

  const chapter = classifyMathChapter(problem);
  const grade = ["Geometry", "Trigonometry", "Probability", "Sequences and Series"].includes(chapter)
    ? 10
    : def.defaultGrade;

  return {
    question_text: problem,
    option_a: byLabel.A,
    option_b: byLabel.B,
    option_c: byLabel.C,
    option_d: byLabel.D,
    correct_option: answerKey as "A" | "B" | "C" | "D",
    explanation: rationale || null,
    subject: "Mathematics",
    chapterName: chapter,
    grade,
    difficulty: difficultyMathQANoCat(rationale, problem, chapter),
    source: "hf:math_qa",
    source_row_id: String(row.__id ?? row.id ?? ""),
  };
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mapSciQ(row: any, def: DatasetDef, aiTag: { subject: string; chapter: string } | null): NormalizedQuestion | null {
  const q = (row.question ?? "").trim();
  const correct = (row.correct_answer ?? "").trim();
  const d1 = (row.distractor1 ?? "").trim();
  const d2 = (row.distractor2 ?? "").trim();
  const d3 = (row.distractor3 ?? "").trim();
  const support = (row.support ?? "").trim();
  if (!q || !correct || !d1 || !d2 || !d3) return null;

  const opts = shuffle([
    { text: correct, isCorrect: true },
    { text: d1, isCorrect: false },
    { text: d2, isCorrect: false },
    { text: d3, isCorrect: false },
  ]);
  const letters = ["A", "B", "C", "D"] as const;
  const correctLetter = letters[opts.findIndex(o => o.isCorrect)];

  return {
    question_text: q,
    option_a: opts[0].text,
    option_b: opts[1].text,
    option_c: opts[2].text,
    option_d: opts[3].text,
    correct_option: correctLetter,
    explanation: support || null,
    subject: aiTag?.subject || "Science",
    chapterName: aiTag?.chapter || "General Science",
    grade: def.defaultGrade,
    difficulty: difficultySciQ(q, support),
    source: "hf:allenai/sciq",
    source_row_id: String(row.__id ?? ""),
  };
}

function mapOpenBookQA(row: any, def: DatasetDef): NormalizedQuestion | null {
  const stem = (row.question_stem ?? row.question?.stem ?? "").trim();
  const choices = row.choices ?? row.question?.choices;
  const answerKey = String(row.answerKey ?? "").trim().toUpperCase();
  const fact1 = (row.fact1 ?? "").trim();
  if (!stem || !choices || !answerKey) return null;

  // choices may be {text: [...], label: [...]} or array of {label, text}
  let labels: string[] = [];
  let texts: string[] = [];
  if (Array.isArray(choices)) {
    labels = choices.map((c: any) => String(c.label ?? "").toUpperCase());
    texts = choices.map((c: any) => String(c.text ?? "").trim());
  } else if (choices.label && choices.text) {
    labels = choices.label.map((l: any) => String(l).toUpperCase());
    texts = choices.text.map((t: any) => String(t).trim());
  }
  if (labels.length !== 4 || texts.length !== 4) return null;
  if (!labels.includes(answerKey)) return null;

  // Re-order to A/B/C/D
  const byLabel = Object.fromEntries(labels.map((l, i) => [l, texts[i]])) as Record<string, string>;
  if (!byLabel.A || !byLabel.B || !byLabel.C || !byLabel.D) return null;

  return {
    question_text: stem,
    option_a: byLabel.A,
    option_b: byLabel.B,
    option_c: byLabel.C,
    option_d: byLabel.D,
    correct_option: answerKey as "A" | "B" | "C" | "D",
    explanation: fact1 || null,
    subject: def.fixedSubject || "Science",
    chapterName: "General Science",
    grade: def.defaultGrade,
    difficulty: difficultyOpenBookQA(row, fact1, stem),
    source: "hf:allenai/openbookqa",
    source_row_id: String(row.__id ?? row.id ?? ""),
  };
}

// ---------- AI batched tagger (SciQ only) ----------
const SUBJECTS_ALLOWED = ["Physics", "Chemistry", "Biology"];

async function tagSciQBatch(questions: string[]): Promise<Array<{ subject: string; chapter: string }>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    // Fallback: keyword classifier
    return questions.map(q => fallbackScienceClassify(q));
  }
  const numbered = questions.map((q, i) => `${i + 1}. ${q.slice(0, 280)}`).join("\n");
  const prompt = `Classify each science MCQ stem below into:
- subject: one of Physics, Chemistry, Biology
- chapter: a SHORT 1-3 word topic name (e.g. "Cells", "Acids and Bases", "Newton's Laws", "Genetics")

Return ONLY a JSON array, one object per input, in order:
[{"subject":"Biology","chapter":"Cells"}, ...]

Inputs:
${numbered}`;

  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a strict classifier. Output ONLY valid JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) {
      console.warn("AI tag failed", r.status, await r.text().catch(() => ""));
      return questions.map(q => fallbackScienceClassify(q));
    }
    const data = await r.json();
    const txt: string = data?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = txt.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return questions.map(q => fallbackScienceClassify(q));
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr) || arr.length !== questions.length) {
      return questions.map(q => fallbackScienceClassify(q));
    }
    return arr.map((x: any, i: number) => {
      const subject = SUBJECTS_ALLOWED.includes(x?.subject) ? x.subject : fallbackScienceClassify(questions[i]).subject;
      const chapter = (x?.chapter || "General").toString().trim().slice(0, 60) || "General";
      return { subject, chapter: titleCase(chapter) };
    });
  } catch (e) {
    console.warn("AI tag error", e);
    return questions.map(q => fallbackScienceClassify(q));
  }
}

function fallbackScienceClassify(q: string): { subject: string; chapter: string } {
  const t = q.toLowerCase();
  const bio = /\b(cell|organ|gene|dna|rna|plant|animal|species|tissue|enzyme|blood|muscle|nerve|virus|bacteri|photosynth|reprodu|ecosystem|evolution|protein|hormone)\b/;
  const chem = /\b(acid|base|ph |atom|molecul|element|compound|reaction|salt|oxid|reduc|metal|ion|solution|gas|liquid|periodic|bond|isotope)\b/;
  const phys = /\b(force|energy|motion|velocity|accelerat|gravity|electric|magnet|wave|light|sound|heat|temperature|pressure|voltage|current|circuit|newton|friction|momentum)\b/;
  if (bio.test(t)) return { subject: "Biology", chapter: "General Biology" };
  if (chem.test(t)) return { subject: "Chemistry", chapter: "General Chemistry" };
  if (phys.test(t)) return { subject: "Physics", chapter: "General Physics" };
  return { subject: "Biology", chapter: "General Science" };
}

// ---------- DB helpers ----------
class ChapterCache {
  private cache = new Map<string, string>(); // key: grade|subject|chapterName -> id
  public createdCount = 0;
  constructor(private supabase: any) {}

  async resolve(grade: number, subject: string, chapterName: string): Promise<{ chapterId: string; batchId: string }> {
    // Find batch
    const { data: batch } = await this.supabase
      .from("batches")
      .select("id")
      .eq("grade", grade)
      .eq("exam_type", "Foundation")
      .maybeSingle();
    if (!batch) throw new Error(`Foundation Grade ${grade} batch not found`);
    const batchId = batch.id as string;

    const key = `${batchId}|${subject}|${chapterName.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached) return { chapterId: cached, batchId };

    // Look up existing
    const { data: existing } = await this.supabase
      .from("chapters")
      .select("id")
      .eq("batch_id", batchId)
      .eq("subject", subject)
      .ilike("chapter_name", chapterName)
      .maybeSingle();
    if (existing?.id) {
      this.cache.set(key, existing.id);
      return { chapterId: existing.id, batchId };
    }

    // Create
    const slug = `${slugify(chapterName)}-g${grade}-${slugify(subject)}`;
    const { data: created, error } = await this.supabase
      .from("chapters")
      .insert({
        batch_id: batchId,
        subject,
        chapter_name: chapterName,
        name: chapterName,
        slug,
        class_level: grade,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Chapter create failed for ${subject} / ${chapterName}: ${error?.message || "unknown error"}`);
    this.createdCount++;
    this.cache.set(key, created.id);
    return { chapterId: created.id, batchId };
  }
}

// ---------- Core: fetch + map a page ----------
async function fetchRowsPage(def: DatasetDef, offset: number, length: number) {
  const cfg = def.config || "default";
  // Resolve actual config from splits if "default" doesn't work
  const url = `${HF}/rows?dataset=${encodeURIComponent(def.datasetPath)}&config=${encodeURIComponent(cfg)}&split=${encodeURIComponent(def.split)}&offset=${offset}&length=${length}`;
  const r = await fetch(url);
  if (!r.ok) {
    // Try discovering config via /splits
    const sp = await fetch(`${HF}/splits?dataset=${encodeURIComponent(def.datasetPath)}`);
    if (!sp.ok) throw new Error(`HF rows ${r.status} and splits ${sp.status}`);
    const splits = await sp.json();
    const list = splits?.splits || [];
    const match = list.find((s: any) => s.split === def.split) || list[0];
    if (!match) throw new Error(`No splits found for ${def.datasetPath}`);
    const url2 = `${HF}/rows?dataset=${encodeURIComponent(def.datasetPath)}&config=${encodeURIComponent(match.config)}&split=${encodeURIComponent(match.split)}&offset=${offset}&length=${length}`;
    const r2 = await fetch(url2);
    if (!r2.ok) throw new Error(`HF rows ${r2.status} after fallback`);
    return await r2.json();
  }
  return await r.json();
}

async function mapPage(key: DatasetKey, def: DatasetDef, rows: any[]): Promise<{ items: NormalizedQuestion[]; skipReasons: SkipReasons }> {
  const skipReasons: SkipReasons = {};
  if (key === "math-qa") {
    const items: NormalizedQuestion[] = [];
    for (const row of rows) {
      const mapped = mapMathQA(row, def);
      if (mapped) items.push(mapped);
      else addSkip(skipReasons, "MathQA row does not have exactly 4 A-D options or valid answerKey");
    }
    return { items, skipReasons };
  }
  if (key === "openbookqa-main") {
    const items: NormalizedQuestion[] = [];
    for (const row of rows) {
      const mapped = mapOpenBookQA(row, def);
      if (mapped) items.push(mapped);
      else addSkip(skipReasons, "OpenBookQA row missing stem, 4 A-D choices, or answerKey");
    }
    return { items, skipReasons };
  }
  // SciQ: batch tag, then map
  const valid = rows.filter(r => r?.question && r?.correct_answer);
  addSkip(skipReasons, "SciQ row missing question or correct_answer", rows.length - valid.length);
  const tags = await tagSciQBatch(valid.map(r => r.question));
  const out: NormalizedQuestion[] = [];
  for (let i = 0; i < valid.length; i++) {
    const m = mapSciQ(valid[i], def, tags[i]);
    if (m) out.push(m);
    else addSkip(skipReasons, "SciQ row missing one or more distractors/options");
  }
  return { items: out, skipReasons };
}

async function insertQuestions(supabase: any, cache: ChapterCache, items: NormalizedQuestion[]) {
  let imported = 0;
  let skipped = 0;
  const skipReasons: SkipReasons = {};
  const chaptersCreatedBefore = cache.createdCount;
  for (const it of items) {
    const resolved = await cache.resolve(it.grade, it.subject, it.chapterName);
    const hash = await sha256(`${it.question_text}|${it.option_a}|${it.option_b}|${it.option_c}|${it.option_d}`);

    // Dedup
    const { data: dup } = await supabase
      .from("questions")
      .select("id")
      .eq("content_hash", hash)
      .maybeSingle();
    if (dup) { skipped++; addSkip(skipReasons, "Duplicate content_hash already exists"); continue; }

    const { error } = await supabase.from("questions").insert({
      batch_id: resolved.batchId,
      chapter_id: resolved.chapterId,
      subject: it.subject,
      chapter: it.chapterName,
      question: it.question_text,
      question_text: it.question_text,
      option_a: it.option_a,
      option_b: it.option_b,
      option_c: it.option_c,
      option_d: it.option_d,
      correct_option: it.correct_option,
      correct_answer: it.correct_option,
      explanation: it.explanation,
      difficulty: it.difficulty,
      question_type: "single_correct",
      source: it.source,
      source_row_id: it.source_row_id || null,
      content_hash: hash,
      is_active: true,
      is_verified: false,
      language: "en",
    });
    if (error) {
      skipped++;
      addSkip(skipReasons, `Question insert failed: ${error.message}`);
    } else {
      imported++;
    }
  }
  const chaptersCreated = cache.createdCount - chaptersCreatedBefore;
  return { imported, skipped, chaptersCreated, skipReasons };
}

// ---------- Handlers ----------
async function handlePreview(body: any) {
  const key = body.datasetKey as DatasetKey;
  const def = DATASETS[key];
  if (!def) return { error: `Unknown datasetKey: ${key}` };

  const page = await fetchRowsPage(def, 0, 50);
  const rawRows = (page?.rows || []).map((r: any) => ({ ...r.row, __id: r.row_idx }));
  const { items: mapped, skipReasons } = await mapPage(key, def, rawRows);

  const chapterDist: Record<string, number> = {};
  const subjectDist: Record<string, number> = {};
  const difficultyDist: Record<string, number> = { Easy: 0, Medium: 0, Hard: 0 };
  for (const m of mapped) {
    chapterDist[m.chapterName] = (chapterDist[m.chapterName] || 0) + 1;
    subjectDist[m.subject] = (subjectDist[m.subject] || 0) + 1;
    difficultyDist[m.difficulty] = (difficultyDist[m.difficulty] || 0) + 1;
  }
  return {
    datasetKey: key,
    sampleSize: rawRows.length,
    mappedCount: mapped.length,
    droppedCount: rawRows.length - mapped.length,
    chapterDistribution: Object.entries(chapterDist).sort((a, b) => b[1] - a[1]),
    subjectDistribution: Object.entries(subjectDist).sort((a, b) => b[1] - a[1]),
    difficultyDistribution: Object.entries(difficultyDist),
    skipReasons,
    samplePairs: rawRows.slice(0, 3).map((raw: any, i: number) => ({
      raw,
      mapped: key === "math-qa"
        ? mapMathQA(raw, def)
        : key === "openbookqa-main"
          ? mapOpenBookQA(raw, def)
          : mapSciQ(raw, def, fallbackScienceClassify(raw.question || "")),
    })),
  };
}

async function handleStart(body: any, supabase: any, authUserId: string | null) {
  const key = body.datasetKey as DatasetKey;
  const def = DATASETS[key];
  if (!def) return { error: `Unknown datasetKey: ${key}` };

  const maxRows = Math.min(Math.max(parseInt(body.maxRows ?? "5000", 10), 50), 50000);

  // Clear abandoned HF jobs so the admin UI does not stay locked forever after an edge timeout.
  await supabase
    .from("import_jobs")
    .update({
      status: "failed",
      error: "Marked stale before starting a new HF import.",
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .like("source", "hf:%")
    .eq("status", "running")
    .lt("updated_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());

  // Create job
  const { data: job, error: jobErr } = await supabase
    .from("import_jobs")
    .insert({
      source: `hf:${def.datasetPath}`,
      dataset_path: def.datasetPath,
      status: "running",
      total: 0,
      imported: 0,
      skipped: 0,
      chapters_created: 0,
      options: { datasetKey: key, maxRows },
      created_by: authUserId,
    })
    .select("id")
    .single();
  if (jobErr) return { error: `Failed to create job: ${jobErr.message}` };

  // Process the first safe chunk before returning so the UI never sits at 0/0.
  await runImportChunk(supabase, job.id, key, def, maxRows, 0);
  const { data: startedJob } = await supabase
    .from("import_jobs")
    .select("status,total,imported,skipped,chapters_created,skip_reasons,error")
    .eq("id", job.id)
    .maybeSingle();

  return { jobId: job.id, status: startedJob?.status || "running", job: startedJob };
}

async function runImportChunk(supabase: any, jobId: string, key: DatasetKey, def: DatasetDef, maxRows: number, startOffset: number) {
    const cache = new ChapterCache(supabase);
    let offset = startOffset;
    let totalImported = 0;
    let totalSkipped = 0;
    let totalSeen = 0;
    let allSkipReasons: SkipReasons = {};

    const { data: currentJob } = await supabase
      .from("import_jobs")
      .select("total, imported, skipped, chapters_created, skip_reasons")
      .eq("id", jobId)
      .maybeSingle();
    if (currentJob) {
      totalSeen = Number(currentJob.total || 0);
      totalImported = Number(currentJob.imported || 0);
      totalSkipped = Number(currentJob.skipped || 0);
      allSkipReasons = mergeSkipReasons(currentJob.skip_reasons || {});
    }

    try {
      const chunkTarget = Math.min(maxRows, totalSeen + PROCESS_CHUNK_SIZE);
      let reachedEndOfDataset = false;
      while (totalSeen < chunkTarget) {
        const length = Math.min(PAGE_SIZE, chunkTarget - totalSeen);
        const page = await fetchRowsPage(def, offset, length);
        const rawRows = (page?.rows || []).map((r: any) => ({ ...r.row, __id: r.row_idx }));
        if (rawRows.length === 0) { reachedEndOfDataset = true; break; }
        totalSeen += rawRows.length;

        const { items: mapped, skipReasons: mapSkipReasons } = await mapPage(key, def, rawRows);
        const res = await insertQuestions(supabase, cache, mapped);
        totalImported += res.imported;
        totalSkipped += res.skipped + (rawRows.length - mapped.length);
        allSkipReasons = mergeSkipReasons(allSkipReasons, mapSkipReasons, res.skipReasons);

        await supabase.from("import_jobs").update({
          total: totalSeen,
          imported: totalImported,
          skipped: totalSkipped,
          chapters_created: Number(currentJob?.chapters_created || 0) + cache.createdCount,
          skip_reasons: allSkipReasons,
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);

        offset += length;
        if (rawRows.length < length) { reachedEndOfDataset = true; break; }
      }

      if (totalSeen >= maxRows || reachedEndOfDataset) {
        await supabase.from("import_jobs").update({
          status: "completed",
          skip_reasons: allSkipReasons,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      } else {
        scheduleNextChunk(jobId, key, maxRows, offset);
      }
    } catch (e: any) {
      await supabase.from("import_jobs").update({
        status: "failed",
        error: String(e?.message || e).slice(0, 1000),
        skip_reasons: allSkipReasons,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
}

function scheduleNextChunk(jobId: string, datasetKey: DatasetKey, maxRows: number, offset: number) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hf-aligned-importer`;
  const functionKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const promise = fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: functionKey,
      Authorization: `Bearer ${functionKey}`,
    },
    body: JSON.stringify({ action: "continue", jobId, datasetKey, maxRows, offset }),
  }).catch((e) => console.error("Failed to schedule next HF import chunk", e));
  if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
    (EdgeRuntime as any).waitUntil(promise);
  }
}

async function handleContinue(body: any, supabase: any) {
  const key = body.datasetKey as DatasetKey;
  const def = DATASETS[key];
  if (!def) return { error: `Unknown datasetKey: ${key}` };
  if (!body.jobId) return { error: "jobId required" };
  const maxRows = Math.min(Math.max(parseInt(body.maxRows ?? "5000", 10), 50), 50000);
  const offset = Math.max(parseInt(body.offset ?? "0", 10), 0);
  await runImportChunk(supabase, String(body.jobId), key, def, maxRows, offset);
  return { ok: true };
}

async function handleStatus(body: any, supabase: any) {
  const { jobId } = body;
  if (!jobId) return { error: "jobId required" };
  const { data, error } = await supabase
    .from("import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { job: data };
}

// ---------- Serve ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Try to surface caller id for audit (optional)
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      try {
        const { data } = await supabase.auth.getUser(auth.slice(7));
        userId = data?.user?.id ?? null;
      } catch { /* ignore */ }
    }

    const body = await req.json();
    const action = body?.action || "preview";

    let result: any;
    if (action === "preview") result = await handlePreview(body);
    else if (action === "start") result = await handleStart(body, supabase, userId);
    else if (action === "continue") result = await handleContinue(body, supabase);
    else if (action === "status") result = await handleStatus(body, supabase);
    else result = { error: `Unknown action: ${action}` };

    const status = result?.error ? 400 : 200;
    return new Response(JSON.stringify(result), { status, headers: corsHeaders });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: corsHeaders });
  }
});

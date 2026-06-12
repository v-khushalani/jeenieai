import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type DatasetRow = {
  id?: number | string;
  title?: string;
  slug?: string;
  question?: string;
  tags?: string;
  options?: string;
  correct_option?: string;
  answer?: string;
  difficulty?: string;
  source_db?: string;
};

type ParsedTags = {
  subject: string;
  chapter: string;
  exam: string;
  session: string;
};

const CHAPTER_ALIASES: Record<string, string> = {
  "thermodynamics (c)": "Thermodynamics",
  "alcohols phenols and ethers": "Alcohols, Phenols and Ethers",
  "work power energy": "Work, Power and Energy",
  "d and f block elements": "d and f Block Elements",
  "s block elements": "s Block Elements",
  "p block elements (group 13 & 14)": "p Block Elements",
  "p block elements (group 15, 16, 17 & 18)": "p Block Elements",
  "ray optics": "Ray Optics",
  "rotational motion": "Rotational Motion",
  "some basic concepts of chemistry": "Some Basic Concepts of Chemistry",
  "chemical bonding and molecular structure": "Chemical Bonding and Molecular Structure",
  "current electricity": "Current Electricity",
  "laws of motion": "Laws of Motion",
  "electrostatics": "Electrostatics",
  "magnetic effects of current": "Magnetic Effects of Current",
  "waves and sound": "Waves and Sound",
  "thermodynamics": "Thermodynamics",
  "biomolecules": "Biomolecules",
  "hydrocarbons": "Hydrocarbons",
  "ionic equilibrium": "Ionic Equilibrium",
  "probability": "Probability",
  "sequences and series": "Sequences and Series",
  "vector algebra": "Vector Algebra",
  "biological classification": "Biological Classification",
  "human reproduction": "Human Reproduction",
  "human health and diseases": "Human Health and Diseases",
  "principles of inheritance and variation": "Principles of Inheritance and Variation",
  "molecular basis of inheritance": "Molecular Basis of Inheritance",
};

function normalizeKey(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[(),{}]/g, " ")
    .replace(/\[/g, " ")
    .replace(/\]/g, " ")
    .replace(/[^\w\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name: string) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(raw: unknown): ParsedTags {
  const fallback: ParsedTags = { subject: "", chapter: "", exam: "", session: "" };
  if (!raw) return fallback;

  let parts: string[] = [];
  if (Array.isArray(raw)) {
    parts = raw.map((v) => String(v ?? "").trim()).filter(Boolean);
  } else {
    const str = String(raw).trim();
    if (!str) return fallback;
    const quoted = [...str.matchAll(/'([^']*)'/g)].map((m) => m[1].trim()).filter(Boolean);
    if (quoted.length > 0) {
      parts = quoted;
    } else {
      const cleaned = str.replace(/^\[|\]$/g, "");
      parts = cleaned.split(",").map((p) => p.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    }
  }

  return {
    subject: parts[0] || fallback.subject,
    chapter: parts[1] || fallback.chapter,
    exam: parts[2] || fallback.exam,
    session: parts[3] || fallback.session,
  };
}

function parseOptionLetters(html: string | null) {
  if (!html) return [] as { letter: string; html: string; text: string; isCorrect: boolean }[];
  const items = Array.from(String(html).matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi));
  return items
    .map((match) => {
      const attrs = match[1] || "";
      const body = match[2] || "";
      const letterMatch = body.match(/option-label">\s*([A-D])/i) || body.match(/\b([A-D])\b/);
      const letter = (letterMatch?.[1] || "").toUpperCase();
      const textMatch = body.match(/<span class="option-data">([\s\S]*?)<\/span>/i);
      const html = (textMatch?.[1] || body).trim();
      const text = stripHtml(html).trim();
      return {
        letter,
        html,
        text,
        isCorrect: /class\s*=\s*"[^"]*correct[^"]*"/i.test(attrs) || /class\s*=\s*"[^"]*correct[^"]*"/i.test(body),
      };
    })
    .filter((entry) => entry.letter);
}

// Exam-based difficulty heuristic. Deterministic and consistent with adaptive engine buckets.
function difficultyFromExam(examRaw: string): "Easy" | "Medium" | "Hard" {
  const e = normalizeKey(examRaw);
  if (e.includes("advanced")) return "Hard";
  if (e.includes("bitsat")) return "Easy";
  if (e.includes("mh cet") || e.includes("mhcet") || e.includes("mh-cet")) return "Easy";
  if (e.includes("jee")) return "Medium";   // JEE Mains
  if (e.includes("neet")) return "Medium";
  if (e.includes("aiims")) return "Medium";
  if (e.includes("jipmer")) return "Medium";
  return "Medium";
}

// Parse PYQ metadata from tags[3], e.g. "JEE Advanced 2008 (Paper 1)"
function extractPyqMeta(session: string, examFallback: string) {
  const src = `${session || ""} ${examFallback || ""}`;
  const yearMatch = src.match(/\b(19|20)\d{2}\b/);
  const paperMatch = src.match(/\(([^)]+)\)/);
  return {
    year: yearMatch ? Number(yearMatch[0]) : null,
    session: paperMatch ? paperMatch[1].trim() : null,
  };
}

// Extract first image URL from HTML (preserve question/explanation images that stripHtml would destroy)
function extractFirstImage(html: string): string | null {
  if (!html) return null;
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// MD5-equivalent stable hash using Web Crypto. Used for dedup.
async function contentHash(text: string): Promise<string> {
  const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const buf = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("MD5", buf).catch(async () => crypto.subtle.digest("SHA-256", buf));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Detect question type using parsed options + question/explanation text.
// Returns one of: single_correct | multi_correct | numerical_int | numerical_decimal | assertion_reason | matrix_match | comprehension
function detectQuestionType(
  parsedOptions: { letter: string; html: string; text: string; isCorrect: boolean }[],
  correctOptionRaw: string | null,
  questionText: string,
  explanationText: string,
): { type: string; numericalAnswer: number | null } {
  const qLower = String(questionText || "").toLowerCase();
  const correctText = stripHtml(correctOptionRaw || "");

  // No MCQ options → numerical answer
  if (parsedOptions.length === 0) {
    if (correctText) {
      const isDecimal = /-?\d+\.\d+/.test(correctText);
      const numericMatch = correctText.match(/-?\d+(?:\.\d+)?/g);
      const num = numericMatch ? Number(numericMatch[numericMatch.length - 1]) : null;
      return {
        type: isDecimal ? "numerical_decimal" : "numerical_int",
        numericalAnswer: num,
      };
    }
    return { type: "numerical_int", numericalAnswer: null };
  }

  // Matrix/list match — column matching pattern in question text
  if (
    (/\bmatch\b/.test(qLower) && (/\bcolumn\b|\blist\s*-?\s*i\b|\blist\s+1\b/.test(qLower))) ||
    /matrix\s*match/.test(qLower)
  ) {
    return { type: "matrix_match", numericalAnswer: null };
  }

  // Assertion–Reason pattern (very common in PYQs)
  if (/\bassertion\b/.test(qLower) && /\breason\b/.test(qLower)) {
    return { type: "assertion_reason", numericalAnswer: null };
  }

  // Comprehension / passage-based — question references a passage
  if (/\bpassage\b|\bparagraph\b|\bcomprehension\b/.test(qLower)) {
    return { type: "comprehension", numericalAnswer: null };
  }

  // Multi-correct vs single-correct based on how many options are flagged correct
  const correctCount = parsedOptions.filter((o) => o.isCorrect).length;
  // Also check if the correct_option blob explicitly says "answers are" (plural)
  const pluralAnswers = /correct\s+answers\s+are/i.test(correctOptionRaw || "");
  if (correctCount >= 2 || pluralAnswers) {
    return { type: "multi_correct", numericalAnswer: null };
  }
  return { type: "single_correct", numericalAnswer: null };
}

function canonicalChapter(rawChapter: string) {
  const normalized = normalizeKey(rawChapter);
  return CHAPTER_ALIASES[normalized] || rawChapter.trim();
}

function resolveChapterName(tags: ParsedTags) {
  const sourceChapter = String(tags.chapter || "").trim();
  return sourceChapter ? canonicalChapter(sourceChapter) : "";
}

function subjectCodeFromLabel(label: string) {
  const normalized = normalizeKey(label);
  if (normalized === "physics") return "PHYSICS";
  if (normalized === "chemistry") return "CHEMISTRY";
  if (normalized === "math" || normalized === "maths" || normalized === "mathematics") return "MATHEMATICS";
  if (normalized === "biology" || normalized === "bio") return "BIOLOGY";
  return "PHYSICS";
}

function examEnumFromText(exam: string) {
  const normalized = normalizeKey(exam);
  if (normalized.includes("neet")) return "NEET";
  if (normalized.includes("advanced")) return "JEE_ADVANCED";
  if (normalized.includes("jee") || normalized.includes("mains")) return "JEE_MAINS";
  return null;
}

function batchSlugFromExam(exam: string, subjectCode: string) {
  const normalized = normalizeKey(exam);
  if (normalized.includes("neet") || subjectCode === "BIOLOGY") return "neet-12";
  return "jee-12";
}

function inferClassLevel(batchSlug: string) {
  return batchSlug.endsWith("11") ? 11 : 12;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return await res.json();
}

async function getDatasetSize(datasetPath: string) {
  const data = await fetchJson(`https://datasets-server.huggingface.co/size?dataset=${encodeURIComponent(datasetPath)}`);
  return Number(data?.size?.splits?.[0]?.num_rows || data?.size?.dataset?.num_rows || 0);
}

async function loadRows(datasetPath: string, split: string, offset: number, length: number) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(datasetPath)}&config=default&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
  const data = await fetchJson(url);
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return rows.map((entry: any) => entry?.row || entry || {} as DatasetRow) as DatasetRow[];
}

function makeChapterSlug(batchSlug: string, subjectCode: string, chapterName: string) {
  return `${slugify(batchSlug)}-${slugify(subjectCode)}-${slugify(chapterName)}`.slice(0, 90);
}

async function upsertOneBySlug<T extends { slug: string }>(admin: any, table: string, payload: T) {
  const { data: existing } = await admin.from(table).select("id, slug").eq("slug", payload.slug).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: inserted, error } = await admin.from(table).insert(payload).select("id").maybeSingle();
  if (error) throw error;
  return inserted?.id as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (action === "peek") {
      const datasetPath = body.datasetPath;
      const split = body.split || "train";
      const [rows, totalRows] = await Promise.all([
        loadRows(datasetPath, split, 0, 5),
        getDatasetSize(datasetPath).catch(() => null),
      ]);
      const sampleRows = rows.map((row) => {
        const tags = parseTags(row.tags);
        const chapter = resolveChapterName(tags);
        const subject = tags.subject || row.source_db || "";
        const exam = tags.exam || "";
        return {
          raw: row,
          subject,
          chapter,
          chapter_slug: slugify(chapter),
          exam,
          pyq_exam: examEnumFromText(exam),
          session: tags.session,
          year: /\b(19|20)\d{2}\b/.exec(tags.session || exam || row.title || "")?.[0] || null,
          paper: tags.session,
          source: row.source_db || null,
          question: stripHtml(row.question || row.title || ""),
          options: row.options || null,
          correct: stripHtml(row.correct_option || ""),
          explanation: stripHtml(row.answer || ""),
        };
      });
      return new Response(JSON.stringify({
        preview: {
          totalRows,
          cleanedSample: sampleRows[0] || null,
          sampleRows,
          columnsReport: {
            used: [
              { column: "id", mapsTo: "source (dedup key suffix)" },
              { column: "slug", mapsTo: "source (fallback dedup key)" },
              { column: "title", mapsTo: "question_text (fallback when question empty)" },
              { column: "question", mapsTo: "question_text + question_image_url (HTML stripped, LaTeX preserved)" },
              { column: "tags[0]", mapsTo: "subject (Physics / Chemistry / Math / Biology)" },
              { column: "tags[1]", mapsTo: "chapter + chapter_slug (via CHAPTER_ALIASES canonicalization)" },
              { column: "tags[2]", mapsTo: "exam + pyq_exam enum + difficulty (heuristic) + batch (JEE/NEET, class 11/12)" },
              { column: "tags[3]", mapsTo: "session + paper + pyq_year + pyq_session + is_pyq flag" },
              { column: "options", mapsTo: "option_a/b/c/d + correct_option (parsed from HTML, .correct class)" },
              { column: "correct_option", mapsTo: "correct_option (fallback when not flagged in options)" },
              { column: "answer", mapsTo: "explanation (HTML preserved for images + LaTeX)" },
              { column: "source_db", mapsTo: "subject inference fallback + source tracking" },
              { column: "(derived)", mapsTo: "question_type (single/multi/numerical/AR/MM/comprehension), numerical_answer, content_hash (dedup), language=en, is_active=true" },
            ],
            skipped: [],
          },
        },
      }), { headers: corsHeaders });
    }


    if (action === "cancel") {
      const jobId = body.jobId;
      if (!jobId) return new Response(JSON.stringify({ error: "jobId required" }), { status: 400, headers: corsHeaders });
      await admin.from("import_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", jobId);
      return new Response(JSON.stringify({ ok: true, cancelled: true }), { headers: corsHeaders });
    }

    if (action === "status") {
      const jobId = body.jobId;
      const { data: job, error } = await admin.from("import_jobs").select("*").eq("id", jobId).maybeSingle();
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      return new Response(JSON.stringify({ job }), { headers: corsHeaders });
    }

    if (action === "import") {
      const datasetPath = body.datasetPath;
      const split = body.split || "train";
      const demoLimit = body.limit ? Number(body.limit) : null;
      const startOffset = body.offset ? Number(body.offset) : (body.startOffset ? Number(body.startOffset) : 0);
      const sourceTag = body.sourceTag || `hf:${datasetPath}`;
      const totalRows = await getDatasetSize(datasetPath);
      const effectiveTotal = demoLimit
        ? (startOffset ? Math.min(totalRows || (startOffset + demoLimit), startOffset + demoLimit) : Math.min(totalRows || demoLimit, demoLimit))
        : totalRows;

      // Cancel any prior running jobs for the same sourceTag to avoid orphan duplicates
      const { data: stale } = await admin.from("import_jobs").select("id, options").eq("status", "running");
      for (const j of (stale || [])) {
        if ((j as any)?.options?.sourceTag === sourceTag) {
          await admin.from("import_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", (j as any).id);
        }
      }

      const { data: jobRow, error: jobErr } = await admin
        .from("import_jobs")
        .insert({
          dataset_path: datasetPath,
          status: "running",
          total: effectiveTotal,
          imported: 0,
          skipped: 0,
          chapters_created: 0,
          topics_created: 0,
          skip_reasons: {},
          options: { sourceTag, demo: !!demoLimit, datasetPath, split, offset: startOffset || 0, nextOffset: startOffset || 0, effectiveTotal, workers: {} },
          started_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      if (jobErr) throw jobErr;
      const jobId = jobRow?.id as string;

      // Spawn N parallel workers — each handles a fixed slice of the dataset
      const WORKER_COUNT = Number(body.workers) || 8;
      const tickUrl = `${SUPABASE_URL}/functions/v1/hf-dataset-importer`;
      const sliceSize = Math.ceil((effectiveTotal - (startOffset || 0)) / WORKER_COUNT);
      const dispatches: Promise<unknown>[] = [];
      for (let i = 0; i < WORKER_COUNT; i++) {
        const wStart = (startOffset || 0) + i * sliceSize;
        const wEnd = Math.min(effectiveTotal, wStart + sliceSize);
        if (wStart >= wEnd) continue;
        dispatches.push(
          fetch(tickUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
            body: JSON.stringify({ action: "tick", jobId, workerIndex: i, sliceStart: wStart, sliceEnd: wEnd }),
          }).catch(() => {})
        );
      }
      // @ts-ignore EdgeRuntime exists at runtime
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(Promise.all(dispatches));
      }

      return new Response(JSON.stringify({ ok: true, job_id: jobId, total: effectiveTotal, started: true, workers: WORKER_COUNT }), { headers: corsHeaders });
    }

    if (action === "tick") {
      const jobId = body.jobId;
      if (!jobId) return new Response(JSON.stringify({ error: "jobId required" }), { status: 400, headers: corsHeaders });

      const { data: job } = await admin.from("import_jobs").select("*").eq("id", jobId).maybeSingle();
      if (!job) return new Response(JSON.stringify({ error: "job not found" }), { status: 404, headers: corsHeaders });
      if (job.status !== "running") {
        return new Response(JSON.stringify({ ok: true, done: true, status: job.status }), { headers: corsHeaders });
      }

      const opts: any = job.options || {};
      const datasetPath = opts.datasetPath;
      const split = opts.split || "train";
      const sourceTag = opts.sourceTag;
      const effectiveTotal: number = Number(opts.effectiveTotal || job.total || 0);

      // Worker-scoped slice. Falls back to whole-dataset (single worker) for backward compat.
      const workerIndex: number | null = (body.workerIndex !== undefined && body.workerIndex !== null) ? Number(body.workerIndex) : null;
      const workersState: any = opts.workers || {};
      const workerKey = workerIndex !== null ? `w${workerIndex}` : "main";
      const sliceStart: number = Number(body.sliceStart ?? workersState[workerKey]?.sliceStart ?? 0);
      const sliceEnd: number = Number(body.sliceEnd ?? workersState[workerKey]?.sliceEnd ?? effectiveTotal);
      let offset: number = Number(workersState[workerKey]?.nextOffset ?? sliceStart);
      if (offset < sliceStart) offset = sliceStart;

      const { data: subjectRows } = await admin.from("subjects").select("id, code, name");
      const subjectIdByCode = new Map<string, string>();
      const subjectNameToCode: Record<string, string> = {
        physics: "PHYSICS", chemistry: "CHEMISTRY", maths: "MATHEMATICS",
        mathematics: "MATHEMATICS", math: "MATHEMATICS", biology: "BIOLOGY",
      };
      for (const row of subjectRows || []) subjectIdByCode.set(String(row.code), String(row.id));

      const { data: batchRows } = await admin.from("batches").select("id, slug, grade");
      const batchIdBySlug = new Map<string, string>();
      const batchGradeBySlug = new Map<string, number>();
      for (const row of batchRows || []) {
        batchIdBySlug.set(String(row.slug), String(row.id));
        batchGradeBySlug.set(String(row.slug), Number(row.grade || 12));
      }

      const { data: chapterRows } = await admin.from("chapters").select("id, name, slug, subject_id, batch_id");
      const existingChapterByBatchSubjectName = new Map<string, string>();
      const existingChapterBySubjectName = new Map<string, string>();
      for (const row of chapterRows || []) {
        const normalizedName = normalizeKey(String(row.name || ""));
        if (!normalizedName) continue;
        const batchId = String(row.batch_id || "");
        const subjectId = String(row.subject_id || "");
        if (batchId && subjectId) existingChapterByBatchSubjectName.set(`${batchId}:${subjectId}:${normalizedName}`, String(row.id));
        if (subjectId && !existingChapterBySubjectName.has(`${subjectId}:${normalizedName}`)) {
          existingChapterBySubjectName.set(`${subjectId}:${normalizedName}`, String(row.id));
        }
      }

      const chapterIdCache = new Map<string, string>();
      const topicIdCache = new Map<string, string>();
      const chaptersCreated = new Set<string>();
      const topicsCreated = new Set<string>();
      const skipReasons: Record<string, number> = {};
      let imported = 0; // delta this tick
      let skipped = 0;  // delta this tick
      const subjectMaxOrder = new Map<string, number>();

      const PAGE_SIZE = 100;
      const TICK_BUDGET_MS = 25_000;
      const tickStart = Date.now();
      let pagesThisTick = 0;

      while (offset < sliceEnd && (Date.now() - tickStart) < TICK_BUDGET_MS) {
        if (pagesThisTick % 3 === 0) {
          const { data: state } = await admin.from("import_jobs").select("status").eq("id", jobId).maybeSingle();
          if (state?.status === "cancelled") break;
        }

        const length = Math.min(PAGE_SIZE, effectiveTotal - offset);
        let pageRows: DatasetRow[] = [];
        try {
          pageRows = await loadRows(datasetPath, split, offset, length);
        } catch (_e) {
          break; // transient HF API issue — retry next tick
        }
        if (!pageRows.length) { offset += length; continue; }

        const pagePayloads: Record<string, unknown>[] = [];
        const seenHashesPage = new Set<string>();

        for (const row of pageRows) {
          const tags = parseTags(row.tags);
          const subjectCode = subjectIdByCode.has(subjectNameToCode[normalizeKey(tags.subject)] || tags.subject)
            ? (subjectNameToCode[normalizeKey(tags.subject)] || tags.subject)
            : subjectCodeFromLabel(tags.subject || row.source_db || "");
          const subjectId = subjectIdByCode.get(subjectCode) || subjectIdByCode.get("PHYSICS") || null;
          const batchSlug = batchIdBySlug.has(batchSlugFromExam(tags.exam, subjectCode))
            ? batchSlugFromExam(tags.exam, subjectCode)
            : (tags.exam.toLowerCase().includes("neet") ? "neet-12" : "jee-12");
          const batchId = batchIdBySlug.get(batchSlug) || null;
          const classLevel = batchGradeBySlug.get(batchSlug) || inferClassLevel(batchSlug);

          const datasetFallback = String(datasetPath || "").split("/").pop() || "Imported";
          const resolved = resolveChapterName(tags) || "";
          const normalizedResolved = normalizeKey(resolved);
          const isGenericChapter = ['general', 'miscellaneous', 'misc'].includes(normalizedResolved);
          const chapterName = (!resolved || isGenericChapter) ? datasetFallback.replace(/[-_]/g, ' ') : resolved;
          const chapterSlug = makeChapterSlug(batchSlug, subjectCode, chapterName);
          const chapterCacheKey = `${batchSlug}:${subjectCode}:${chapterSlug}`;

          let chapterId = chapterIdCache.get(chapterCacheKey) || null;
          if (!chapterId) {
            const exactExistingKey = `${batchId || ""}:${subjectId || ""}:${normalizeKey(chapterName)}`;
            chapterId = existingChapterByBatchSubjectName.get(exactExistingKey)
              || existingChapterBySubjectName.get(`${subjectId || ""}:${normalizeKey(chapterName)}`)
              || null;
            if (!chapterId) {
              const existingChapter = await admin.from("chapters").select("id").eq("slug", chapterSlug).maybeSingle();
              chapterId = existingChapter.data?.id || null;
            }
            if (!chapterId) {
              const subjKey = subjectId || "global";
              let nextOrder = subjectMaxOrder.get(subjKey) ?? -1;
              if (nextOrder < 0) {
                const { data: maxRow } = await admin.from("chapters").select("chapter_number").eq("subject_id", subjectId).order("chapter_number", { ascending: false }).limit(1).maybeSingle();
                nextOrder = (maxRow?.chapter_number ?? 0);
              }
              nextOrder += 1;
              subjectMaxOrder.set(subjKey, nextOrder);
              const { data: created, error: chapterErr } = await admin
                .from("chapters")
                .insert({
                  name: chapterName, chapter_name: chapterName, slug: chapterSlug,
                  subject_id: subjectId, subject: subjectCode,
                  batch_id: batchId, class_level: classLevel,
                  is_active: true, is_free: false, chapter_number: nextOrder,
                })
                .select("id").maybeSingle();
              if (chapterErr) {
                const retry = await admin.from("chapters").select("id").eq("slug", chapterSlug).maybeSingle();
                chapterId = retry.data?.id || null;
                if (!chapterId) {
                  const key = `chapter_insert:${(chapterErr.message || "unknown").slice(0, 80)}`;
                  skipReasons[key] = (skipReasons[key] || 0) + 1;
                  console.error("chapter insert failed", { slug: chapterSlug, name: chapterName, subjectId, batchId, err: chapterErr.message });
                }
              } else {
                chapterId = created?.id || null;
                if (chapterId) chaptersCreated.add(chapterId);
              }
              if (chapterId && batchId && subjectId) {
                existingChapterByBatchSubjectName.set(`${batchId}:${subjectId}:${normalizeKey(chapterName)}`, chapterId);
                existingChapterBySubjectName.set(`${subjectId}:${normalizeKey(chapterName)}`, chapterId);
              }
            }
            if (chapterId) chapterIdCache.set(chapterCacheKey, chapterId);
          }

          const topicName = chapterName;
          const topicCacheKey = chapterId ? `${chapterId}:${slugify(topicName)}` : null;
          let topicId = topicCacheKey ? topicIdCache.get(topicCacheKey) || null : null;
          if (chapterId && !topicId) {
            const existingTopic = await admin.from("topics").select("id").eq("chapter_id", chapterId).eq("name", topicName).maybeSingle();
            topicId = existingTopic.data?.id || null;
            if (!topicId) {
              const { data: createdTopic, error: topicErr } = await admin
                .from("topics")
                .insert({
                  name: topicName, topic_name: topicName, slug: `${chapterSlug}-topic`,
                  chapter_id: chapterId, topic_number: 1, display_order: 1, is_active: true,
                })
                .select("id").maybeSingle();
              if (!topicErr) {
                topicId = createdTopic?.id || null;
                if (topicId) topicsCreated.add(topicId);
              }
            }
            if (topicId && topicCacheKey) topicIdCache.set(topicCacheKey, topicId);
          }

          const rawQuestionHtml = String(row.question || row.title || "");
          const questionText = stripHtml(rawQuestionHtml);
          const questionImageUrl = extractFirstImage(rawQuestionHtml);
          const rawOptions = row.options && String(row.options).trim() !== "None" ? row.options : null;
          const examEnum = examEnumFromText(tags.exam);
          const perRowSource = String(row.id ?? row.slug ?? `row-${offset}`);
          const parsedOptions = parseOptionLetters(rawOptions);
          const correctOptionText = stripHtml(row.correct_option || "") || null;
          const correctOption = parsedOptions.find((o) => o.isCorrect)?.letter
            || parsedOptions.find((o) => normalizeKey(o.text) === normalizeKey(correctOptionText || ""))?.letter || null;
          const explanation = row.answer ? String(row.answer) : null;

          const { type: questionType, numericalAnswer } = detectQuestionType(
            parsedOptions, row.correct_option ? String(row.correct_option) : null, questionText, explanation || "",
          );

          const hash = await contentHash(questionText);
          if (!hash) { skipped += 1; skipReasons["empty_question"] = (skipReasons["empty_question"] || 0) + 1; continue; }
          if (seenHashesPage.has(hash)) { skipped += 1; skipReasons["duplicate_in_batch"] = (skipReasons["duplicate_in_batch"] || 0) + 1; continue; }
          seenHashesPage.add(hash);

          const rawExam = String(tags.exam || "").trim();
          const cleanExam = (rawExam && !/\.db$/i.test(rawExam)) ? rawExam : null;
          const pyqMeta = extractPyqMeta(tags.session, cleanExam || "");
          const isPyq = !!(pyqMeta.year && examEnum);
          const difficulty = difficultyFromExam(cleanExam || "");
          const allCorrectLetters = parsedOptions.filter((o) => o.isCorrect).map((o) => o.letter);

          const payload: Record<string, unknown> = {
            question: questionText, question_text: questionText,
            question_image_url: questionImageUrl, content_hash: hash,
            source: `${sourceTag}:${perRowSource}`,
            subject: subjectCode, subject_id: subjectId,
            chapter: chapterName, chapter_id: chapterId,
            topic: topicName, topic_id: topicId,
            batch_id: batchId, exam: cleanExam,
            is_active: true, language: "en", difficulty, explanation,
            options: parsedOptions.map((o) => o.html),
            option_a: parsedOptions[0]?.html || null,
            option_b: parsedOptions[1]?.html || null,
            option_c: parsedOptions[2]?.html || null,
            option_d: parsedOptions[3]?.html || null,
            question_type: questionType, numerical_answer: numericalAnswer,
            is_pyq: isPyq, pyq_year: pyqMeta.year, pyq_session: pyqMeta.session, pyq_exam: examEnum,
          };
          if (questionType === "multi_correct" && allCorrectLetters.length > 0) {
            payload.correct_options = allCorrectLetters;
            payload.correct_option = allCorrectLetters.join(",");
          } else if (correctOption) {
            payload.correct_option = correctOption;
            payload.correct_options = [correctOption];
          }
          pagePayloads.push(payload);
        }

        if (pagePayloads.length) {
          const { data: upserted, error: upErr } = await admin
            .from("questions")
            .upsert(pagePayloads, { onConflict: "content_hash", ignoreDuplicates: true })
            .select("id");
          if (upErr) {
            for (const single of pagePayloads) {
              const { error: singleErr } = await admin.from("questions").insert(single);
              if (singleErr) {
                skipped += 1;
                const key = (singleErr.message || "insert_error").slice(0, 120);
                skipReasons[key] = (skipReasons[key] || 0) + 1;
              } else {
                imported += 1;
              }
            }
          } else {
            const insertedCount = (upserted || []).length;
            imported += insertedCount;
            const dupCount = pagePayloads.length - insertedCount;
            if (dupCount > 0) {
              skipped += dupCount;
              skipReasons["duplicate_in_db"] = (skipReasons["duplicate_in_db"] || 0) + dupCount;
            }
          }
        }

        offset += pageRows.length;
        pagesThisTick += 1;

        // Accumulate counters via read-modify-write (drift tolerated under concurrency;
        // a reconcile action can fix totals from the questions table afterwards).
        const { data: cur } = await admin.from("import_jobs").select("imported, skipped, chapters_created, topics_created, skip_reasons, options").eq("id", jobId).maybeSingle();
        const mergedSkipReasons: Record<string, number> = { ...(cur?.skip_reasons as any || {}) };
        for (const [k, v] of Object.entries(skipReasons)) mergedSkipReasons[k] = (mergedSkipReasons[k] || 0) + (v as number);
        const curOpts = (cur?.options as any) || opts;
        const curWorkers = curOpts.workers || {};
        curWorkers[workerKey] = { ...(curWorkers[workerKey] || {}), sliceStart, sliceEnd, nextOffset: offset };
        await admin.from("import_jobs").update({
          imported: (Number(cur?.imported) || 0) + imported,
          skipped: (Number(cur?.skipped) || 0) + skipped,
          chapters_created: (Number(cur?.chapters_created) || 0) + chaptersCreated.size,
          topics_created: (Number(cur?.topics_created) || 0) + topicsCreated.size,
          skip_reasons: mergedSkipReasons,
          options: { ...curOpts, workers: curWorkers },
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        // Reset deltas now that they're persisted
        imported = 0; skipped = 0;
        chaptersCreated.clear(); topicsCreated.clear();
        for (const k of Object.keys(skipReasons)) delete skipReasons[k];
      }

      const { data: finalState } = await admin.from("import_jobs").select("status, options").eq("id", jobId).maybeSingle();
      if (finalState?.status === "cancelled") {
        await admin.from("import_jobs").update({ finished_at: new Date().toISOString() }).eq("id", jobId);
        return new Response(JSON.stringify({ ok: true, cancelled: true }), { headers: corsHeaders });
      }

      if (offset < sliceEnd) {
        // Worker slice not done — reschedule this same worker with its current position
        const tickUrl = `${SUPABASE_URL}/functions/v1/hf-dataset-importer`;
        const next = fetch(tickUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
          body: JSON.stringify({ action: "tick", jobId, workerIndex, sliceStart, sliceEnd }),
        }).catch(() => {});
        // @ts-ignore
        if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(next);
        }
        return new Response(JSON.stringify({ ok: true, workerIndex, offset, sliceEnd, more: true }), { headers: corsHeaders });
      }

      // This worker's slice is done. Mark it and, if all workers are done, mark the job completed.
      const finalOpts = (finalState?.options as any) || {};
      const finalWorkers = finalOpts.workers || {};
      finalWorkers[workerKey] = { ...(finalWorkers[workerKey] || {}), sliceStart, sliceEnd, nextOffset: sliceEnd, done: true };
      await admin.from("import_jobs").update({
        options: { ...finalOpts, workers: finalWorkers },
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);

      // Check if all expected workers are done
      const expectedKeys = Object.keys(finalWorkers);
      const allDone = expectedKeys.length > 0 && expectedKeys.every((k) => finalWorkers[k]?.done);
      if (allDone) {
        await admin.from("import_jobs").update({
          status: "completed",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
      }

      return new Response(JSON.stringify({ ok: true, workerIndex, done: true, allDone }), { headers: corsHeaders });
    }

    // resume action: re-kicks a stalled running job
    if (action === "resume") {
      const jobId = body.jobId;
      if (!jobId) return new Response(JSON.stringify({ error: "jobId required" }), { status: 400, headers: corsHeaders });
      const tickUrl = `${SUPABASE_URL}/functions/v1/hf-dataset-importer`;
      const fire = fetch(tickUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
        body: JSON.stringify({ action: "tick", jobId }),
      }).catch(() => {});
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any).waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(fire);
      }
      return new Response(JSON.stringify({ ok: true, resumed: true }), { headers: corsHeaders });
    }

    if (action === "recent_jobs") {
      const sourceTag = body.sourceTag || `hf:${body.datasetPath}`;
      const limit = Number(body.limit || 20);
      const { data, error } = await admin.from("import_jobs").select("*").order("started_at", { ascending: false }).limit(limit);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      const jobs = (data || []).filter((j: any) => (j.options && j.options.sourceTag) === sourceTag);
      return new Response(JSON.stringify({ jobs }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers: corsHeaders });
  } catch (e) {
    const errMessage = e instanceof Error ? e.message : (typeof e === 'object' ? JSON.stringify(e) : String(e));
    const errStack = e instanceof Error ? e.stack : null;
    return new Response(JSON.stringify({ error: errMessage, stack: errStack }), { status: 500, headers: corsHeaders });
  }
});

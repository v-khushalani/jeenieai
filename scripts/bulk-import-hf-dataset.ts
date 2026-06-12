import { createHash } from "crypto";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

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

type ColumnInfo = {
  column_name: string;
  data_type: string;
  udt_name: string;
};

type QuestionRecord = {
  fingerprint: string;
  question: string;
  question_text: string;
  source: string;
  subject: string;
  chapter: string;
  chapter_slug: string;
  topic: string;
  topic_slug: string;
  batch_slug: string | null;
  exam: string | null;
  question_type: string;
  language: string;
  is_active: boolean;
  options: string[];
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_option: string | null;
  correct_options: string[];
  numerical_answer: number | null;
  explanation: string | null;
  difficulty: string;
  chapter_id?: string | null;
  topic_id?: string | null;
  batch_id?: string | null;
};

const DATASET_PATH = process.env.DATASET_PATH || "datavorous/entrance-exam-dataset";
const SPLIT = process.env.SPLIT || "train";
const LIMIT = Number(process.env.LIMIT || 2000);
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const SOURCE_TAG = process.env.SOURCE_TAG || "datavorous/entrance-exam-dataset-bulk";
const APPLY = process.env.APPLY !== "false";

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
  thermodynamics: "Thermodynamics",
  biomolecules: "Biomolecules",
  hydrocarbons: "Hydrocarbons",
  ionic_equilibrium: "Ionic Equilibrium",
  probability: "Probability",
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
    .replace(/[(){}.,]/g, " ")
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
    .replace(/<br\s*\/?>(\s*)/gi, " ")
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
    parts = raw.map((value) => String(value ?? "").trim()).filter(Boolean);
  } else {
    const str = String(raw).trim();
    if (!str) return fallback;
    const quoted = [...str.matchAll(/'([^']*)'/g)].map((match) => match[1].trim()).filter(Boolean);
    if (quoted.length > 0) {
      parts = quoted;
    } else {
      const cleaned = str.replace(/^\[|\]$/g, "");
      parts = cleaned.split(",").map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
    }
  }

  return {
    subject: parts[0] || fallback.subject,
    chapter: parts[1] || fallback.chapter,
    exam: parts[2] || fallback.exam,
    session: parts[3] || fallback.session,
  };
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
  try {
    const data = await fetchJson(`https://datasets-server.huggingface.co/size?dataset=${encodeURIComponent(datasetPath)}`);
    return Number(data?.size?.splits?.[0]?.num_rows || data?.size?.dataset?.num_rows || 0);
  } catch {
    return 0;
  }
}

async function loadRows(datasetPath: string, split: string, offset: number, length: number) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(datasetPath)}&config=default&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const data = await fetchJson(url);
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      return rows.map((entry: any) => (entry?.row || entry || {}) as DatasetRow);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/:( 5|500|502|503|504)\b/.test(message) && attempt < 3) {
        // keep retrying transient server errors and unexpected responses alike
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || `Failed to load rows at offset ${offset}`));
}

function parseOptionsHtml(html: string | null) {
  if (!html) return [] as string[];
  const items = Array.from(String(html).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((match) => match[1] || "");
  const cleaned = items.map((item) => stripHtml(item).trim()).filter(Boolean);
  if (cleaned.length) return cleaned;
  return String(html)
    .split(/<br\s*\/?>/i)
    .map((part) => stripHtml(part).trim())
    .filter(Boolean);
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

function determineDifficulty(question: string, options: string[]): string {
  const text = (question + options.join(" ")).toLowerCase();
  const hard = ["derive", "prove", "integration", "differential equation", "complex", "jee advanced", "assertion", "matrix", "determinant", "limit", "calculus", "electromagnetic", "quantum", "mechanism", "equilibrium", "titration", "adiabatic", "capacitance", "vector", "collision", "probability"];
  const easy = ["define", "what is", "name the", "identify", "basic", "simple", "which of the following", "fill in", "true or false", "ncert", "fundamental", "state the"];
  const hardCount = hard.filter((value) => text.includes(value)).length;
  const easyCount = easy.filter((value) => text.includes(value)).length;
  const wordCount = question.split(/\s+/).filter(Boolean).length;
  const mathSignals = (text.match(/\\frac|\\sqrt|\\times|\\int|\\sum|\\lim|\\begin|\\left|\\right|[=^_{}]/g) || []).length;
  const symbolSignals = (text.match(/[0-9%()]/g) || []).length;
  const hardScore = hardCount * 2 + Math.min(3, mathSignals) + (wordCount > 35 ? 1 : 0) + (wordCount > 60 ? 1 : 0) + (symbolSignals > 12 ? 1 : 0);
  const easyScore = easyCount * 2 + (wordCount < 18 ? 2 : wordCount < 28 ? 1 : 0);
  if (hardScore >= 4) return "Hard";
  if (easyScore >= 3 && hardScore <= 1) return "Easy";
  return "Medium";
}

function normalizeDifficulty(value: unknown) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes('easy')) return 'Easy';
  if (text.includes('hard')) return 'Hard';
  if (text.includes('medium') || text.includes('moderate')) return 'Medium';
  return null;
}

function parseNumericalAnswer(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const matches = String(candidate).match(/-?\d+(?:\.\d+)?/g);
    if (matches && matches.length > 0) {
      const last = matches[matches.length - 1];
      const parsed = Number(last);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

function sqlText(value: string | null | undefined) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown) {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

function sqlBool(value: boolean) {
  return value ? "TRUE" : "FALSE";
}

function sqlNumber(value: number | null | undefined) {
  return value === null || value === undefined || Number.isNaN(value) ? "NULL" : String(value);
}

function sqlArray(values: string[]) {
  return `ARRAY[${values.map((value) => sqlText(value)).join(", ")}]`;
}

function makeQhash(record: {
  question: string;
  options: string[];
  correctOption: string | null;
  chapterSlug: string;
  exam: string | null;
}) {
  const raw = JSON.stringify({
    question: normalizeKey(record.question),
    options: record.options.map((option) => normalizeKey(option)),
    correctOption: normalizeKey(record.correctOption || ""),
    chapterSlug: record.chapterSlug,
    exam: normalizeKey(record.exam || ""),
  });
  return createHash("sha256").update(raw).digest("hex");
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function runSupabaseQuery(sql: string) {
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "--output", "json", sql],
    { encoding: "utf8", env: process.env, maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error([result.stderr, result.stdout].filter(Boolean).join("\n").trim() || "supabase db query failed");
  }
  const stdout = result.stdout.trim();
  if (!stdout) return [] as any[];
  return JSON.parse(stdout) as any[];
}

function runSupabaseFile(sql: string) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "hf-bulk-import-"));
  const sqlFile = path.join(tmpDir, "batch.sql");
  writeFileSync(sqlFile, sql, "utf8");
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "--output", "json", "--file", sqlFile],
    { encoding: "utf8", env: process.env, maxBuffer: 50 * 1024 * 1024 },
  );
  rmSync(tmpDir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error([result.stderr, result.stdout].filter(Boolean).join("\n").trim() || "supabase db query --file failed");
  }
  return result.stdout.trim();
}

function buildInsertSql(
  table: string,
  columns: ColumnInfo[],
  rows: Record<string, unknown>[],
) {
  const columnNames = columns.map((column) => column.column_name);
  const columnTypeByName = new Map(columns.map((column) => [column.column_name, column]));
  const rowSqlValues = rows.map((row) => {
    const rowValues = columnNames.map((columnName) => {
      const column = columnTypeByName.get(columnName)!;
      const value = row[columnName];

      if (value === null || value === undefined) return "NULL";

      const dataType = column.data_type.toLowerCase();
      const udtName = column.udt_name.toLowerCase();

      if (dataType === "json" || dataType === "jsonb") {
        return sqlJson(value);
      }

      if (dataType === "boolean") {
        return sqlBool(Boolean(value));
      }

      if (["smallint", "integer", "bigint", "numeric", "real", "double precision"].includes(dataType)) {
        return sqlNumber(Number(value));
      }

      if (dataType === "array" || udtName.startsWith("_")) {
        const arrayValues = Array.isArray(value) ? value.map((entry) => String(entry)) : [String(value)];
        const baseType = udtName.slice(1) || "text";
        return `${sqlArray(arrayValues)}::${baseType}[]`;
      }

      return sqlText(String(value));
    });

    return `(${rowValues.join(", ")})`;
  });

  return `INSERT INTO public.${table} (${columnNames.map((column) => `"${column}"`).join(", ")}) VALUES\n${rowSqlValues.join(",\n")}\nON CONFLICT DO NOTHING;`;
}

async function main() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required for linked db queries");
  }

  console.log(`[bulk-import] dataset=${DATASET_PATH} split=${SPLIT} limit=${LIMIT} pageSize=${PAGE_SIZE}`);

  const totalRows = await getDatasetSize(DATASET_PATH);
  const effectiveTotal = Math.min(totalRows || LIMIT, LIMIT);
  const existingHashes = new Set<string>();
  const existingQuestionRows = runSupabaseQuery(`
    select question, question_text, options, correct_option, chapter, exam
    from public.questions;
  `) as any[];
  for (const row of existingQuestionRows) {
    const existingOptions = parseStoredOptions(row.options);
    const fingerprint = makeQhash({
      question: String(row.question || row.question_text || ""),
      options: existingOptions,
      correctOption: row.correct_option ? String(row.correct_option) : null,
      chapterSlug: slugify(String(row.chapter || "")),
      exam: row.exam ? String(row.exam) : null,
    });
    existingHashes.add(fingerprint);
  }

  const questionColumns = runSupabaseQuery(`
    select column_name, data_type, udt_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'questions'
    order by ordinal_position;
  `) as ColumnInfo[];
  const chapterColumns = runSupabaseQuery(`
    select column_name, data_type, udt_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'chapters'
    order by ordinal_position;
  `) as ColumnInfo[];
  const topicColumns = runSupabaseQuery(`
    select column_name, data_type, udt_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'topics'
    order by ordinal_position;
  `) as ColumnInfo[];

  const questionTypeEnumRows = runSupabaseQuery(`
    select enumlabel as label
    from pg_enum
    join pg_type on pg_type.oid = pg_enum.enumtypid
    where pg_type.typname = 'question_type_enum';
  `) as { label: string }[];
  const questionTypeLabels = questionTypeEnumRows.map((row) => row.label);
  const singleCorrectType = questionTypeLabels.includes("single_correct") ? "single_correct" : questionTypeLabels[0] || "single_correct";
  const numericalType = questionTypeLabels.find((label) => /numerical|numeric|integer|float/i.test(label)) || singleCorrectType;

  const batchRows = runSupabaseQuery(`select id, slug from public.batches where slug in ('jee-12', 'neet-12');`) as { id: string; slug: string }[];
  const batchIdBySlug = new Map(batchRows.map((row) => [String(row.slug), String(row.id)]));

  const records: QuestionRecord[] = [];
  const chapterMap = new Map<string, { name: string; slug: string; subject: string; batchSlug: string; classLevel: number }>();
  const topicMap = new Map<string, { name: string; slug: string; chapterSlug: string }>();
  const seenHashes = new Set<string>();
  let skippedUnusable = 0;

  for (let offset = 0; offset < effectiveTotal; offset += PAGE_SIZE) {
    const length = Math.min(PAGE_SIZE, effectiveTotal - offset);
    const rows = await loadRows(DATASET_PATH, SPLIT, offset, length);
    if (!rows.length) break;

    for (const row of rows) {
      const tags = parseTags(row.tags);
      const subject = tags.subject || row.source_db || "Physics";
      const subjectCode = subjectCodeFromLabel(subject);
      const resolvedExam = tags.exam || row.source_db || "";
      const batchSlug = batchSlugFromExam(resolvedExam, subjectCode);
      const chapterNameBase = resolveChapterName(tags) || String(DATASET_PATH || "").split("/").pop() || "Imported";
      const normalizedResolved = normalizeKey(chapterNameBase);
      const isGenericChapter = ["general", "miscellaneous", "misc"].includes(normalizedResolved);
      const chapterName = isGenericChapter ? chapterNameBase.replace(/[-_]/g, " ") : chapterNameBase;
      const chapterSlug = `${slugify(batchSlug)}-${slugify(subjectCode)}-${slugify(chapterName)}`.slice(0, 90);
      const topicSlug = `${chapterSlug}-topic`;
      const questionText = stripHtml(row.question || row.title || "");
      const rawOptions = row.options && String(row.options).trim() !== "None" ? row.options : null;
      const parsedOptions = parseOptionLetters(rawOptions);
      const optionTexts = parsedOptions.map((option) => option.text || stripHtml(option.html));
      const correctOptionText = stripHtml(row.correct_option || "") || null;
      const explanation = stripHtml(row.answer || "");
      const correctOption = parsedOptions.find((option) => option.isCorrect)?.letter || parsedOptions.find((option) => normalizeKey(option.text) === normalizeKey(correctOptionText || ""))?.letter || null;
      const qhash = makeQhash({
        question: questionText,
        options: optionTexts,
        correctOption: correctOption || correctOptionText,
        chapterSlug,
        exam: resolvedExam || null,
      });

      if (existingHashes.has(qhash) || seenHashes.has(qhash)) continue;
      seenHashes.add(qhash);

      const numericAnswer = !parsedOptions.length ? parseNumericalAnswer(correctOptionText, explanation, row.title, row.question) : null;
      if (!parsedOptions.length && numericAnswer === null) {
        skippedUnusable += 1;
        continue;
      }
      const questionType = parsedOptions.length > 0 ? singleCorrectType : numericalType;
      const difficulty = normalizeDifficulty((row as any).difficulty) || determineDifficulty(questionText, optionTexts);
      const sourceId = String(row.id ?? row.slug ?? qhash.slice(0, 12));

      chapterMap.set(chapterSlug, {
        name: chapterName,
        slug: chapterSlug,
        subject: subjectCode,
        batchSlug,
        classLevel: inferClassLevel(batchSlug),
      });
      topicMap.set(topicSlug, {
        name: chapterName,
        slug: topicSlug,
        chapterSlug,
      });

      records.push({
        fingerprint: qhash,
        question: questionText,
        question_text: questionText,
        source: `${SOURCE_TAG}:${sourceId}`,
        subject: subjectCode,
        chapter: chapterName,
        chapter_slug: chapterSlug,
        topic: chapterName,
        topic_slug: topicSlug,
        batch_slug: batchSlug,
        exam: resolvedExam || null,
        question_type: questionType,
        language: "en",
        is_active: true,
        options: parsedOptions.map((option) => option.html),
        option_a: parsedOptions[0]?.html || null,
        option_b: parsedOptions[1]?.html || null,
        option_c: parsedOptions[2]?.html || null,
        option_d: parsedOptions[3]?.html || null,
        correct_option: correctOption,
        correct_options: correctOption ? [correctOption] : [],
        numerical_answer: numericAnswer,
        explanation,
        difficulty,
      });
    }

    console.log(`[bulk-import] scanned ${Math.min(offset + rows.length, effectiveTotal)}/${effectiveTotal} rows`);
  }

  console.log(`[bulk-import] unique new rows=${records.length} chapters=${chapterMap.size} topics=${topicMap.size} skipped_unusable=${skippedUnusable}`);

  if (!APPLY) {
    console.log("[bulk-import] dry run only; set APPLY=true to execute inserts");
    return;
  }

  const chapterInsertColumns = chapterColumns.filter((column) => ["name", "slug", "subject_id", "subject", "batch_id", "class_level", "is_active", "is_free", "display_order"].includes(column.column_name));
  const topicInsertColumns = topicColumns.filter((column) => ["name", "topic_name", "slug", "chapter_id", "topic_number", "display_order", "is_active"].includes(column.column_name));

  const batchIdForSlug = (slug: string) => batchIdBySlug.get(slug) || null;

  const chapterInsertRows = Array.from(chapterMap.values()).map((entry) => {
    const row: Record<string, unknown> = {};
    for (const column of chapterInsertColumns) {
      switch (column.column_name) {
        case "name": row.name = entry.name; break;
        case "slug": row.slug = entry.slug; break;
        case "subject_id": row.subject_id = null; break;
        case "subject": row.subject = entry.subject; break;
        case "batch_id": row.batch_id = batchIdForSlug(entry.batchSlug); break;
        case "class_level": row.class_level = entry.classLevel; break;
        case "is_active": row.is_active = true; break;
        case "is_free": row.is_free = false; break;
        case "display_order": row.display_order = 999; break;
      }
    }
    return row;
  });

  for (const rows of chunk(chapterInsertRows, 50)) {
    if (!rows.length) continue;
    const sql = buildInsertSql("chapters", chapterInsertColumns, rows);
    runSupabaseFile(sql);
    console.log(`[bulk-import] upserted ${rows.length} chapters`);
  }

  const topicChapterRows = runSupabaseQuery(
    `select id, slug from public.chapters where slug in (${Array.from(chapterMap.keys()).map((slug) => sqlText(slug)).join(", ")});`,
  ) as { id: string; slug: string }[];
  const chapterIdBySlug = new Map(topicChapterRows.map((row) => [String(row.slug), String(row.id)]));

  const topicInsertRows = Array.from(topicMap.values())
    .map((entry) => ({
      name: entry.name,
      topic_name: entry.name,
      slug: entry.slug,
      chapter_id: chapterIdBySlug.get(entry.chapterSlug) || null,
      topic_number: 1,
      display_order: 1,
      is_active: true,
    }))
    .filter((row) => row.chapter_id);

  for (const rows of chunk(topicInsertRows, 50)) {
    if (!rows.length) continue;
    const sql = buildInsertSql("topics", topicInsertColumns, rows);
    runSupabaseFile(sql);
    console.log(`[bulk-import] upserted ${rows.length} topics`);
  }

  const topicRows = runSupabaseQuery(
    `select id, slug from public.topics where slug in (${Array.from(topicMap.keys()).map((slug) => sqlText(slug)).join(", ")});`,
  ) as { id: string; slug: string }[];
  const topicIdBySlug = new Map(topicRows.map((row) => [String(row.slug), String(row.id)]));

  const questionInsertColumns = questionColumns.filter((column) => {
    const allowed = new Set([
      "qhash",
      "question",
      "question_text",
      "source",
      "subject",
      "chapter",
      "chapter_id",
      "topic",
      "topic_id",
      "batch_id",
      "exam",
      "is_active",
      "language",
      "options",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_option",
      "correct_options",
      "question_type",
      "numerical_answer",
      "difficulty",
      "explanation",
      "answer",
    ]);
    return allowed.has(column.column_name);
  });

  const questionInsertRows = records.map((record) => {
    const row: Record<string, unknown> = {
      question: record.question,
      question_text: record.question_text,
      source: record.source,
      subject: record.subject,
      chapter: record.chapter,
      chapter_id: chapterIdBySlug.get(record.chapter_slug) || null,
      topic: record.topic,
      topic_id: topicIdBySlug.get(record.topic_slug) || null,
      batch_id: batchIdBySlug.get(record.batch_slug || "") || null,
      exam: record.exam,
      is_active: record.is_active,
      language: record.language,
      options: record.options,
      option_a: record.option_a,
      option_b: record.option_b,
      option_c: record.option_c,
      option_d: record.option_d,
      correct_option: record.correct_option,
      correct_options: record.correct_options,
      question_type: record.question_type,
      numerical_answer: record.numerical_answer,
      difficulty: record.difficulty,
      explanation: record.explanation,
    };
    return row;
  }).filter((row) => row.chapter_id && row.topic_id);

  for (const rows of chunk(questionInsertRows, 100)) {
    if (!rows.length) continue;
    const sql = buildInsertSql("questions", questionInsertColumns, rows);
    runSupabaseFile(sql);
    console.log(`[bulk-import] inserted batch of ${rows.length} questions`);
  }

  const insertedResult = runSupabaseQuery(
    `select count(*) as total from public.questions where source like ${sqlText(`${SOURCE_TAG}:%`)};`,
  ) as { total: number }[];
  const inserted = Number(insertedResult[0]?.total || 0);
  const skipped = Math.max(0, effectiveTotal - inserted);
  console.log(JSON.stringify({
    ok: true,
    scanned: effectiveTotal,
    unique_new_rows: records.length,
    inserted,
    skipped,
    skipped_unusable: skippedUnusable,
    chapters: chapterMap.size,
    topics: topicMap.size,
  }, null, 2));
}

function parseStoredOptions(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((entry) => String(entry));
    } catch {
      return [value];
    }
  }
  return [];
}

function explanationForRow(record: QuestionRecord) {
  if (record.correct_option) return record.correct_option;
  if (record.numerical_answer) return record.numerical_answer;
  return null;
}

main().catch((error) => {
  console.error("[bulk-import] failed:", error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
import katexCssUrl from "katex/dist/katex.min.css?url";
import { renderLatex } from "@/utils/mathRenderer";

export interface QuestionPaperQuestion {
  question: string;
  question_text?: string | null;
  question_image_url?: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  subject?: string;
  correct_option?: string;
  correct_options?: string[] | null;
  question_type?: string | null;
  numerical_answer?: number | null;
  explanation?: string | null;
}

export interface QuestionPaperData {
  testTitle: string;
  testDate: string;
  totalQuestions: number;
  questions: QuestionPaperQuestion[];
  withAnswers?: boolean;
}

/**
 * Repair LaTeX commands whose backslash got eaten by JS string escapes
 * (e.g. "\tan" stored as TAB + "an", "\frac" as FORMFEED + "rac").
 */
export function repairEscapedLatex(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\t(?=an\b|heta|imes|au\b|ext|riangle|ilde|o\b)/g, "\\t")
    .replace(/\f(?=rac|orall)/g, "\\f")
    .replace(/\x08(?=eta|ar\b|egin|oldsymbol)/g, "\\b")
    .replace(/\r(?=ho\b|ight|m\b|angle)/g, "\\r")
    .replace(/\v(?=ec\b|arepsilon|arphi)/g, "\\v")
    .replace(/\x07(?=lpha|pprox)/g, "\\a");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const math = (s?: string | null) => (s ? renderLatex(repairEscapedLatex(String(s))) : "");

const isNumerical = (q: QuestionPaperQuestion) =>
  /numer|integer/i.test(q.question_type || "") ||
  (q.numerical_answer != null && !q.option_a && !q.option_b);

function answerOf(q: QuestionPaperQuestion): string {
  if (q.numerical_answer != null) return String(q.numerical_answer);
  if (q.correct_options?.length) return q.correct_options.join(", ").toUpperCase();
  return (q.correct_option || "—").toUpperCase();
}

function optionsHtml(q: QuestionPaperQuestion): string {
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d].map((o) => o || "");
  const longest = Math.max(...opts.map((o) => o.length));
  const cols = longest <= 18 ? 4 : longest <= 45 ? 2 : 1;
  return `<div class="opts c${cols}">${opts
    .map((o, i) => `<div class="opt"><b>(${"ABCD"[i]})</b> <span>${math(o)}</span></div>`)
    .join("")}</div>`;
}

export function buildQuestionPaperHtml(data: QuestionPaperData): string {
  const groups = new Map<string, QuestionPaperQuestion[]>();
  data.questions.forEach((q) => {
    const k = q.subject || "General";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(q);
  });

  let n = 0;
  const sections = [...groups.entries()]
    .map(([subject, qs]) => {
      const mcq = qs.filter((q) => !isNumerical(q));
      const num = qs.filter(isNumerical);
      const block = (list: QuestionPaperQuestion[]) =>
        list
          .map((q) => {
            n += 1;
            const text = q.question_text || q.question || "";
            const img = q.question_image_url
              ? `<img class="diag" src="${esc(q.question_image_url)}" alt="Diagram" />`
              : "";
            const body = isNumerical(q)
              ? `<div class="numbox">Answer: <span></span></div>`
              : optionsHtml(q);
            const ans = data.withAnswers
              ? `<div class="ans"><b>Answer:</b> ${esc(answerOf(q))}${
                  q.explanation ? `<div class="sol"><b>Solution:</b> ${math(q.explanation)}</div>` : ""
                }</div>`
              : "";
            return `<div class="q"><div class="qt"><b>Q${n}.</b> <span>${math(text)}</span></div>${img}${body}${ans}</div>`;
          })
          .join("");
      return `<section><h2>${esc(subject)}</h2>${
        mcq.length ? `<h3>Section A — Multiple Choice</h3>${block(mcq)}` : ""
      }${num.length ? `<h3>Section B — Numerical Value</h3>${block(num)}` : ""}</section>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(data.testTitle)}</title>
<link rel="stylesheet" href="${katexCssUrl}"/>
<style>
@page{size:A4;margin:14mm 14mm 16mm}
*{box-sizing:border-box}
body{font-family:"Times New Roman",Georgia,serif;color:#111;font-size:11.5pt;line-height:1.45;margin:0}
header{border-bottom:2px solid #013062;padding-bottom:8px;margin-bottom:10px}
.brand{font:700 20pt Arial,sans-serif;color:#013062}
.sub{font:9pt Arial,sans-serif;color:#555}
.meta{display:flex;justify-content:space-between;font:9.5pt Arial,sans-serif;margin-top:6px}
h1{font-size:14pt;margin:4px 0}
h2{font:700 13pt Arial,sans-serif;background:#013062;color:#fff;padding:4px 10px;margin:14px 0 6px;break-after:avoid}
h3{font:700 10.5pt Arial,sans-serif;color:#013062;border-bottom:1px solid #ccd;margin:8px 0;break-after:avoid}
.q{break-inside:avoid;page-break-inside:avoid;padding:6px 0 8px;border-bottom:1px dashed #ddd}
.diag{display:block;max-width:70%;max-height:60mm;margin:6px auto;object-fit:contain}
.opts{display:grid;gap:4px 14px;margin:6px 0 0 18px}
.c4{grid-template-columns:repeat(4,1fr)}.c2{grid-template-columns:repeat(2,1fr)}.c1{grid-template-columns:1fr}
.numbox{margin:6px 0 0 18px;font:10pt Arial,sans-serif}
.numbox span{display:inline-block;width:40mm;height:7mm;border:1px solid #333;vertical-align:middle;margin-left:6px}
.ans{margin:6px 0 0 18px;padding:6px 8px;background:#eef4ff;border-left:3px solid #2563eb;font-size:10.5pt}
.sol{margin-top:4px}
.katex{font-size:1.02em}
.katex-display{margin:4px 0;overflow-x:auto}
footer{text-align:center;font:8pt Arial,sans-serif;color:#888;margin-top:14px}
</style></head><body>
<header><div class="brand">JEEnie</div><div class="sub">${data.withAnswers ? "Question Paper with Answer Key &amp; Solutions" : "Question Paper"}</div>
<h1>${esc(data.testTitle)}</h1>
<div class="meta"><span>Date: ${esc(data.testDate)}</span><span>Questions: ${data.totalQuestions}</span></div></header>
${sections}
<footer>Generated by JEEnie · jeenie.website</footer>
</body></html>`;
}

/** Renders the paper in a hidden iframe and opens the print / Save-as-PDF dialog. */
export async function downloadQuestionPaperPdf(data: QuestionPaperData): Promise<void> {
  const html = buildQuestionPaperHtml(data);
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>((resolve) => {
    const imgs = Array.from(doc.images);
    let pending = imgs.length + 1;
    const done = () => --pending <= 0 && resolve();
    imgs.forEach((im) => (im.complete ? done() : (im.onload = im.onerror = done)));
    const link = doc.querySelector("link");
    if (link) { link.addEventListener("load", done); link.addEventListener("error", done); } else done();
    setTimeout(resolve, 4000);
  });
  await (doc as any).fonts?.ready;

  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 60_000);
}

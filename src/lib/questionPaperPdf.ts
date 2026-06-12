import { jsPDF } from "jspdf";
import { renderMathTextForPdf } from "@/utils/mathRenderer";

export interface QuestionPaperQuestion {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export interface QuestionPaperData {
  testTitle: string;
  testDate: string;
  totalQuestions: number;
  questions: QuestionPaperQuestion[];
}

// ── Layout constants (mm) ──────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_LEFT = 18;
const MARGIN_RIGHT = 18;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 22;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
const MAX_Y = PAGE_H - MARGIN_BOTTOM;
const LINE_HEIGHT = 5.5;
const OPTION_LINE_HEIGHT = 5;

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "") || "question_paper";
}

function cleanText(raw: string): string {
  return renderMathTextForPdf(raw);
}

/**
 * Wrap `text` to fit within `maxWidth` mm at the current font.
 * Returns an array of lines.
 */
function wrapText(pdf: jsPDF, text: string, maxWidth: number): string[] {
  return pdf.splitTextToSize(text, maxWidth) as string[];
}

/**
 * Predict the vertical height (mm) a question block will occupy.
 */
function measureQuestion(
  pdf: jsPDF,
  q: QuestionPaperQuestion,
  index: number,
): number {
  const questionText = `${index + 1}. ${cleanText(q.question)}`;
  const qLines = wrapText(pdf, questionText, CONTENT_W);

  const optColWidth = (CONTENT_W - 4) / 2;

  const optionTexts = [
    `(A) ${cleanText(q.option_a)}`,
    `(B) ${cleanText(q.option_b)}`,
    `(C) ${cleanText(q.option_c)}`,
    `(D) ${cleanText(q.option_d)}`,
  ];

  // Options in 2-column grid: row 1 = A & B, row 2 = C & D
  let optHeight = 0;
  for (let r = 0; r < 2; r++) {
    const left = wrapText(pdf, optionTexts[r * 2], optColWidth);
    const right = wrapText(pdf, optionTexts[r * 2 + 1], optColWidth);
    const rowLines = Math.max(left.length, right.length);
    optHeight += rowLines * OPTION_LINE_HEIGHT + 1;
  }

  return qLines.length * LINE_HEIGHT + 3 + optHeight + 6; // gap above + question + gap + options + gap below
}

function drawHeader(
  pdf: jsPDF,
  data: QuestionPaperData,
  isFirstPage: boolean,
  pageNum: number,
  totalPages: number,
): number {
  let y = MARGIN_TOP;

  if (isFirstPage) {
    // Brand
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(1, 48, 98); // #013062
    pdf.text("JEEnie", MARGIN_LEFT, y);
    y += 6;

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100);
    pdf.text("Question Paper Export", MARGIN_LEFT, y);
    y += 7;

    // Title
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(30);
    const titleLines = wrapText(pdf, data.testTitle, CONTENT_W);
    titleLines.forEach((line: string) => {
      pdf.text(line, MARGIN_LEFT, y);
      y += 5.5;
    });
    y += 2;

    // Meta row
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(80);
    pdf.text(`Date: ${data.testDate}`, MARGIN_LEFT, y);
    pdf.text(`Total: ${data.totalQuestions} Qs`, PAGE_W / 2 - 10, y);
    pdf.text(`Marks: ${data.totalQuestions * 4}`, PAGE_W - MARGIN_RIGHT, y, { align: "right" });
    y += 4;

    // Divider
    pdf.setDrawColor(180);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN_LEFT, y, PAGE_W - MARGIN_RIGHT, y);
    y += 6;
  } else {
    // Continuation header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(30);
    const titleLines = wrapText(pdf, data.testTitle, CONTENT_W - 40);
    titleLines.forEach((line: string) => {
      pdf.text(line, MARGIN_LEFT, y);
      y += 5;
    });

    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120);
    pdf.text("Continued", PAGE_W - MARGIN_RIGHT, MARGIN_TOP, { align: "right" });
    y += 3;

    pdf.setDrawColor(200);
    pdf.setLineWidth(0.25);
    pdf.line(MARGIN_LEFT, y, PAGE_W - MARGIN_RIGHT, y);
    y += 5;
  }

  return y;
}

function drawFooter(pdf: jsPDF, pageNum: number, totalPages: number): void {
  const y = PAGE_H - 12;
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.2);
  pdf.line(MARGIN_LEFT, y, PAGE_W - MARGIN_RIGHT, y);

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(130);
  pdf.text("Powered by JEEnie", MARGIN_LEFT, y + 5);
  pdf.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN_RIGHT, y + 5, { align: "right" });
}

function drawQuestion(
  pdf: jsPDF,
  q: QuestionPaperQuestion,
  index: number,
  startY: number,
  totalQuestions: number,
): number {
  let y = startY;

  // Question text
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);
  pdf.setTextColor(20);

  const questionText = `${index + 1}. ${cleanText(q.question)}`;
  const qLines = wrapText(pdf, questionText, CONTENT_W);
  qLines.forEach((line: string) => {
    pdf.text(line, MARGIN_LEFT, y);
    y += LINE_HEIGHT;
  });
  y += 2;

  // Options in 2-column grid
  const optColWidth = (CONTENT_W - 6) / 2;
  const colX = [MARGIN_LEFT + 6, MARGIN_LEFT + 6 + optColWidth + 6];

  const optionTexts = [
    `(A)  ${cleanText(q.option_a)}`,
    `(B)  ${cleanText(q.option_b)}`,
    `(C)  ${cleanText(q.option_c)}`,
    `(D)  ${cleanText(q.option_d)}`,
  ];

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(40);

  for (let row = 0; row < 2; row++) {
    const leftLines = wrapText(pdf, optionTexts[row * 2], optColWidth);
    const rightLines = wrapText(pdf, optionTexts[row * 2 + 1], optColWidth);
    const rowLines = Math.max(leftLines.length, rightLines.length);

    for (let i = 0; i < rowLines; i++) {
      if (leftLines[i]) pdf.text(leftLines[i], colX[0], y);
      if (rightLines[i]) pdf.text(rightLines[i], colX[1], y);
      y += OPTION_LINE_HEIGHT;
    }
    y += 1;
  }

  // Divider between questions
  if (index < totalQuestions - 1) {
    y += 1;
    pdf.setDrawColor(220);
    pdf.setLineWidth(0.15);
    pdf.line(MARGIN_LEFT + 4, y, PAGE_W - MARGIN_RIGHT - 4, y);
    y += 4;
  } else {
    y += 3;
  }

  return y;
}

export async function downloadQuestionPaperPdf(data: QuestionPaperData): Promise<void> {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });

  // First pass: determine page breaks
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.5);

  const pageBreaks: number[] = []; // indices where new pages start
  let simY = drawHeader(pdf, data, true, 1, 1);

  for (let i = 0; i < data.questions.length; i++) {
    const qHeight = measureQuestion(pdf, data.questions[i], i);

    if (simY + qHeight > MAX_Y && i > 0) {
      pageBreaks.push(i);
      // Simulate new page header
      simY = MARGIN_TOP + 18; // approximate continuation header height
    }

    simY += qHeight;
  }

  const totalPages = pageBreaks.length + 1;

  // Second pass: render
  let currentPage = 1;
  let y = drawHeader(pdf, data, true, currentPage, totalPages);
  let nextBreakIdx = 0;

  for (let i = 0; i < data.questions.length; i++) {
    // Check if we need a page break
    if (nextBreakIdx < pageBreaks.length && i === pageBreaks[nextBreakIdx]) {
      drawFooter(pdf, currentPage, totalPages);
      pdf.addPage();
      currentPage++;
      nextBreakIdx++;
      y = drawHeader(pdf, data, false, currentPage, totalPages);
    }

    y = drawQuestion(pdf, data.questions[i], i, y, data.questions.length);
  }

  drawFooter(pdf, currentPage, totalPages);

  pdf.save(`${sanitizeFilename(data.testTitle)}_Question_Paper.pdf`);
}

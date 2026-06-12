import katex from 'katex';
import { logger } from '@/utils/logger';

const GREEK_UNICODE_MAP: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  sigma: 'σ',
  pi: 'π',
  rho: 'ρ',
  phi: 'φ',
  omega: 'ω',
  eta: 'η',
  zeta: 'ζ',
  xi: 'ξ',
};

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
};

const GREEK_ASCII_MAP: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  θ: 'theta',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  σ: 'sigma',
  π: 'pi',
  ρ: 'rho',
  φ: 'phi',
  ω: 'omega',
  η: 'eta',
  ζ: 'zeta',
  ξ: 'xi',
};

const SUBSCRIPT_TO_ASCII_MAP: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};

function toSubscriptDigits(value: string): string {
  return value
    .split('')
    .map((char) => SUBSCRIPT_DIGITS[char] ?? char)
    .join('');
}

function normalizeMatrixBody(matrixBody: string): string {
  const normalizedRows = matrixBody
    .split(/\s*\\+\s*/)
    .map((row: string) => row.trim())
    .filter(Boolean)
    .map((row: string) => row.split('&').map((cell) => cell.trim()).filter(Boolean).join('  '));

  return `[${normalizedRows.join('; ')}]`;
}

function hasOcrPseudoLatex(text: string): boolean {
  return /\\\[\s*array\s+[a-z|]{1,6}\b/i.test(text) || /\|\s*array\s+[a-z|]{1,6}\b/i.test(text) || /\[\s*array\s+[a-z|]{1,6}\b/i.test(text);
}

function normalizeOcrMatrix(text: string): string {
  let normalized = text;

  // OCR often emits pseudo-LaTeX like \[ array cc ... array \]
  normalized = normalized.replace(
    /\\\[\s*array\s+[a-z|]{1,6}\s+([\s\S]*?)\s+array\s*\\\]/gi,
    (_, matrixBody: string) => normalizeMatrixBody(matrixBody)
  );

  // Common OCR matrix with visible delimiters, e.g. | array ccc ... array |
  normalized = normalized.replace(
    /(\[|\||\()\s*array\s+[a-z|]{1,6}\s+([\s\S]*?)\s+array\s*(\]|\||\))/gi,
    (_, openDelimiter: string, matrixBody: string, closeDelimiter: string) => {
      const matrixText = normalizeMatrixBody(matrixBody);

      const left = openDelimiter === '(' ? '[' : openDelimiter;
      const right = closeDelimiter === ')' ? ']' : closeDelimiter;
      return `${left}${matrixText.slice(1, -1)}${right}`;
    }
  );

  return normalized;
}

function normalizeOcrArtifacts(text: string): string {
  let normalized = text;

  normalized = normalizeOcrMatrix(normalized);

  // OCR sometimes emits ^() for degree and ^(n) for exponent.
  normalized = normalized.replace(/(\d+)\s*\^\s*\(\s*\)/g, '$1°');
  normalized = normalized.replace(/([A-Za-z0-9])\s*\^\s*\(\s*([^)]+?)\s*\)/g, '$1^$2');

  normalized = normalized.replace(/\bsqrt\s*\(\s*([^)]+?)\s*\)/gi, '√($1)');

  normalized = normalized.replace(/\b([A-Za-z]+)_\(\s*(\d+)\s*\)/g, (_, symbol: string, digits: string) => {
    return `${symbol}${toSubscriptDigits(digits)}`;
  });

  normalized = normalized.replace(
    /(alpha|beta|gamma|delta|theta|lambda|mu|nu|sigma|pi|rho|phi|omega|eta|zeta|xi)(?![A-Za-z])/gi,
    (match) => GREEK_UNICODE_MAP[match.toLowerCase()] ?? match
  );

  // Remove OCR tildes used in place of spacing/units markers.
  normalized = normalized.replace(/\s*~\s*/g, ' ');

  // Fix spacing around punctuation introduced by OCR.
  normalized = normalized.replace(/\s+,/g, ',');
  normalized = normalized.replace(/\s{2,}/g, ' ').trim();

  return normalized;
}

/**
 * Converts common text patterns to proper Unicode symbols
 */
export function renderMathText(text: string): string {
  if (!text) return '';
  
  let processed = normalizeOcrArtifacts(text);
  
  // Convert common chemistry notations
  processed = processed.replace(/H2O/g, 'H₂O');
  processed = processed.replace(/CO2/g, 'CO₂');
  processed = processed.replace(/O2/g, 'O₂');
  processed = processed.replace(/N2/g, 'N₂');
  processed = processed.replace(/H2/g, 'H₂');
  processed = processed.replace(/SO4/g, 'SO₄');
  processed = processed.replace(/NO3/g, 'NO₃');
  processed = processed.replace(/NH3/g, 'NH₃');
  processed = processed.replace(/CH4/g, 'CH₄');
  processed = processed.replace(/Ca\(OH\)2/g, 'Ca(OH)₂');
  processed = processed.replace(/H2SO4/g, 'H₂SO₄');
  processed = processed.replace(/HNO3/g, 'HNO₃');
  
  // Convert degree symbols
  processed = processed.replace(/(\d+)\s*deg(?:ree)?s?/gi, '$1°');
  
  // Convert arrow symbols
  processed = processed.replace(/->/g, '→');
  processed = processed.replace(/<-/g, '←');
  processed = processed.replace(/<=>/g, '⇌');
  processed = processed.replace(/>=/g, '≥');
  processed = processed.replace(/<=/g, '≤');
  processed = processed.replace(/!=/g, '≠');
  processed = processed.replace(/~=/g, '≈');
  
  // Convert common superscripts
  processed = processed.replace(/\^2(?!\{)/g, '²');
  processed = processed.replace(/\^3(?!\{)/g, '³');
  
  return processed;
}

/**
 * Safely render LaTeX with KaTeX
 */
function renderWithKatex(latex: string, displayMode: boolean = false): string {
  if (!latex || !latex.trim()) return '';
  
  try {
    return katex.renderToString(latex.trim(), {
      displayMode,
      throwOnError: false,
      errorColor: 'inherit',
      strict: false,
      trust: true,
      output: 'html'
    });
  } catch (e) {
    logger.error('KaTeX render error:', e, 'for:', latex.substring(0, 100));
    // Return the original text wrapped in a span so it's at least visible
    return `<span class="katex-error">${latex}</span>`;
  }
}

/**
 * Common LaTeX command patterns that indicate math content
 */
const LATEX_PATTERNS = [
  '\\frac', '\\sqrt', '\\lim', '\\sum', '\\int', '\\prod',
  '\\left', '\\right', '\\begin', '\\end',
  '\\alpha', '\\beta', '\\gamma', '\\delta', '\\theta', '\\epsilon',
  '\\lambda', '\\sigma', '\\pi', '\\omega', '\\infty', '\\mu', '\\nu',
  '\\rho', '\\phi', '\\psi', '\\tau', '\\xi', '\\eta', '\\zeta',
  '\\times', '\\div', '\\pm', '\\neq', '\\leq', '\\geq', '\\approx',
  '\\to', '\\rightarrow', '\\leftarrow', '\\Rightarrow', '\\Leftarrow',
  '\\cdot', '\\vec', '\\hat', '\\bar', '\\dot', '\\ddot',
  '\\cos', '\\sin', '\\tan', '\\cot', '\\sec', '\\csc',
  '\\log', '\\ln', '\\exp',
  '\\mathbf', '\\mathcal', '\\mathbb', '\\mathrm',
  '\\partial', '\\nabla', '\\forall', '\\exists',
  '\\in', '\\notin', '\\subset', '\\supset', '\\cup', '\\cap',
  '\\over', '\\atop', '\\choose',
  '^{', '_{', // subscripts and superscripts with braces
];

/**
 * Check if text contains LaTeX that needs rendering
 */
export function containsLatex(text: string): boolean {
  if (!text) return false;

  if (/\$|\\\(|\\\[/.test(text)) {
    return true;
  }
  
  // Check for common LaTeX commands
  return LATEX_PATTERNS.some(p => text.includes(p));
}

/**
 * Convert mixed OCR/LaTeX/HTML content into ASCII-safe plain text for PDF output.
 */
export function renderMathTextForPdf(text: string): string {
  if (!text) return '';

  let processed = normalizeOcrArtifacts(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\$+/g, ' ')
    // Strip \( \) and \[ \] inline/display delimiters
    .replace(/\\\(/g, ' ')
    .replace(/\\\)/g, ' ')
    .replace(/\\\[/g, ' ')
    .replace(/\\\]/g, ' ');

  // ── Matrix patterns: convert \\ row separators to "; " ──
  // Handle [ ccc 1 2 3 \\ 4 5 6 ] patterns (OCR matrices with alignment specifiers)
  processed = processed.replace(
    /(\[|\|)\s*[clr]{2,6}\s+([\s\S]*?)\s*(\]|\|)/gi,
    (_, open, body, close) => {
      const rows = body.split(/\s*\\\\+\s*/).map((r: string) => r.trim()).filter(Boolean);
      const formatted = rows.join('; ');
      return `${open}${formatted}${close}`;
    }
  );

  // Handle remaining \\ row separators inside brackets (without alignment specifiers)
  processed = processed.replace(
    /(\[)([\s\S]*?\\\\[\s\S]*?)(\])/g,
    (_, open, body, close) => {
      const rows = body.split(/\s*\\\\+\s*/).map((r: string) => r.trim()).filter(Boolean);
      const formatted = rows.join('; ');
      return `${open}${formatted}${close}`;
    }
  );

  // Handle | ccc ... | determinant-style matrices
  processed = processed.replace(
    /\|\s*[clr]{2,6}\s+([\s\S]*?)\s*\|(?=\s*=)/gi,
    (_, body) => {
      const rows = body.split(/\s*\\\\+\s*/).map((r: string) => r.trim()).filter(Boolean);
      const formatted = rows.join('; ');
      return `|${formatted}|`;
    }
  );

  processed = processed
    // Remove remaining standalone OCR alignment specifiers
    .replace(/(?:^|\s)[clr]{2,6}(?=\s|$)/gi, ' ')
    // Handle & as column separator (matrix OCR artifact)
    .replace(/\s*&\s*/g, '  ')
    // Convert remaining \\ to "; " (standalone row separators)
    .replace(/\s*\\\\+\s*/g, '; ')
    // ── Unicode symbols that jsPDF helvetica cannot render → ASCII equivalents ──
    .replace(/\u03A9/g, 'Ohm')  // Ω (Greek capital omega)
    .replace(/\u2126/g, 'Ohm')  // Ω (Ohm sign)
    .replace(/\u00B5/g, 'u')    // µ
    .replace(/\u03BC/g, 'u')    // μ (Greek mu)
    .replace(/\u00B0/g, ' deg') // °
    .replace(/\u00B1/g, '+/-')  // ±
    .replace(/\u2265/g, '>=')   // ≥
    .replace(/\u2264/g, '<=')   // ≤
    .replace(/\u2260/g, '!=')   // ≠
    .replace(/\u2248/g, '~=')   // ≈
    .replace(/\u2192/g, '->')   // →
    .replace(/\u2190/g, '<-')   // ←
    .replace(/\u21CC/g, '<=>')  // ⇌
    .replace(/\u221E/g, 'infinity') // ∞
    .replace(/\u00B7/g, '.')    // ·
    .replace(/\u22C5/g, '.')    // ⋅
    .replace(/\u00D7/g, 'x')   // ×
    .replace(/\u00F7/g, '/')    // ÷
    .replace(/\u221A/g, 'sqrt') // √
    .replace(/\u0394/g, 'Delta') // Δ
    .replace(/\u2206/g, 'Delta') // ∆
    .replace(/\u2211/g, 'Sum')  // ∑
    .replace(/\u222B/g, 'Int')  // ∫
    .replace(/\u2202/g, 'd')    // ∂
    .replace(/\u2207/g, 'del')  // ∇
    .replace(/\u2013/g, '-')    // – (en dash)
    .replace(/\u2014/g, '--')   // — (em dash)
    .replace(/\u2018/g, "'")    // '
    .replace(/\u2019/g, "'")    // '
    .replace(/\u201C/g, '"')    // "
    .replace(/\u201D/g, '"')    // "
    .replace(/\u2022/g, '*')    // •
    .replace(/\u2026/g, '...')  // …
    .replace(/\u00A9/g, '(c)')  // ©
    .replace(/\u00AE/g, '(R)'); // ®

  // ── Matrices: convert \begin{pmatrix}...\end{pmatrix} etc. BEFORE blanket cleanup ──
  // First handle \left[...\right] wrapping matrix environments
  processed = processed.replace(
    /\\left\s*\[\s*\\begin\{([pbBvV]?matrix)\}([\s\S]*?)\\end\{\1\}\s*\\right\s*\]/g,
    (_, _type: string, body: string) => {
      const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
      const formatted = rows.map(r => r.split('&').map(c => c.trim()).join('  ')).join('; ');
      return `[${formatted}]`;
    }
  );
  // Then handle bare matrix environments
  processed = processed.replace(
    /\\begin\{([pbBvV]?matrix)\}([\s\S]*?)\\end\{\1\}/g,
    (_, _type: string, body: string) => {
      const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
      const formatted = rows.map(r => r.split('&').map(c => c.trim()).join('  ')).join('; ');
      return `[${formatted}]`;
    }
  );

  // ── Specific LaTeX commands BEFORE blanket removal ──
  processed = processed
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1/$2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\overline\{([^}]*)\}/g, '$1')
    .replace(/\\vec\{([^}]*)\}/g, '$1')
    .replace(/\\hat\{([^}]*)\}/g, '$1')
    .replace(/\\bar\{([^}]*)\}/g, '$1')
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\times/g, ' x ')
    .replace(/\\cdot/g, ' . ')
    .replace(/\\div/g, ' / ')
    .replace(/\\pm/g, ' +/- ')
    .replace(/\\leq/g, ' <= ')
    .replace(/\\geq/g, ' >= ')
    .replace(/\\neq/g, ' != ')
    .replace(/\\infty/g, 'infinity')
    .replace(/\\to/g, ' -> ')
    .replace(/\\rightarrow/g, ' -> ')
    .replace(/\\Rightarrow/g, ' => ')
    .replace(/\\alpha/g, 'alpha')
    .replace(/\\beta/g, 'beta')
    .replace(/\\gamma/g, 'gamma')
    .replace(/\\delta/g, 'delta')
    .replace(/\\theta/g, 'theta')
    .replace(/\\pi/g, 'pi')
    .replace(/\\mu/g, 'mu')
    .replace(/\\lambda/g, 'lambda')
    .replace(/\\sigma/g, 'sigma')
    .replace(/\\omega/g, 'omega')
    .replace(/\\phi/g, 'phi')
    .replace(/\\epsilon/g, 'epsilon')
    .replace(/\\(sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|sum|int|prod)\b/g, '$1');

  // ── Exponents & subscripts: handle nested braces properly ──
  processed = processed
    .replace(/\^\{([^}]*)\}/g, '^($1)')
    .replace(/_\{([^}]*)\}/g, '_($1)');

  // ── Clean remaining braces and unknown commands LAST ──
  processed = processed
    .replace(/\\begin\{[^}]*\}/g, '')
    .replace(/\\end\{[^}]*\}/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}]/g, ' ');

  processed = renderMathText(processed)
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√\(([^)]+)\)/g, 'sqrt($1)')
    .replace(/[αβγδθλμνσπρφωηζξ]/g, (char) => GREEK_ASCII_MAP[char] ?? char)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => SUBSCRIPT_TO_ASCII_MAP[char] ?? char)
    .replace(/\s+/g, ' ')
    .trim();

  return processed;
}

/**
 * Main function to render LaTeX math expressions
 * This handles:
 * 1. Text with $...$ delimiters (inline math)
 * 2. Text with $$...$$ delimiters (display math)
 * 3. Raw LaTeX without delimiters (auto-wrapped)
 */
export function renderLatex(text: string): string {
  if (!text) return '';

  const normalizedText = normalizeOcrArtifacts(text);

  // Pseudo-LaTeX OCR blocks (like \[ array cc ... \]) should be rendered as normalized text,
  // not passed to KaTeX, which treats them as invalid LaTeX and degrades readability.
  if (hasOcrPseudoLatex(text)) {
    return renderMathText(normalizedText);
  }
  
  // If no LaTeX content at all, just apply basic text conversions
  if (!containsLatex(normalizedText)) {
    return renderMathText(normalizedText);
  }
  
  let result = normalizedText;
  
  // If text has delimiters, process them
  if (normalizedText.includes('$') || normalizedText.includes('\\(') || normalizedText.includes('\\[')) {
    // Handle display math $$...$$
    result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
      return renderWithKatex(latex, true);
    });
    
    // Handle display math \[...\]
    result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, latex) => {
      return renderWithKatex(latex, true);
    });
    
    // Handle inline math \(...\)
    result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_, latex) => {
      return renderWithKatex(latex, false);
    });
    
    // Handle inline math $...$
    // Use a more robust pattern that handles complex content
    result = result.replace(/\$([^$]+)\$/g, (fullMatch, latex) => {
      // Skip if it looks like currency (just numbers)
      if (/^\s*\d+(\.\d+)?\s*$/.test(latex)) {
        return fullMatch;
      }
      return renderWithKatex(latex, false);
    });
    
    // If there are still unprocessed $ signs (odd number), try to handle them
    // This handles cases where there's a single $...$ that didn't get matched
    if (result.includes('$') && !result.includes('class="katex"')) {
      // Extract content between first and last $
      const firstDollar = result.indexOf('$');
      const lastDollar = result.lastIndexOf('$');
      
      if (firstDollar !== lastDollar && firstDollar !== -1) {
        const before = result.substring(0, firstDollar);
        const latex = result.substring(firstDollar + 1, lastDollar);
        const after = result.substring(lastDollar + 1);
        
        result = before + renderWithKatex(latex, false) + after;
      }
    }
  } else {
    // No $ delimiters but has LaTeX commands - render entire text as math
    const isDisplay = normalizedText.includes('\\begin{') || normalizedText.includes('\\\\') || normalizedText.length > 100;
    result = renderWithKatex(normalizedText, isDisplay);
  }
  
  // Apply basic text conversions to any remaining non-KaTeX parts
  // Only if we haven't already processed everything
  if (!result.includes('class="katex"')) {
    result = renderMathText(result);
  }
  
  return result;
}

/**
 * Process text that might contain mixed content (text and LaTeX)
 * More aggressive version that ensures LaTeX is always rendered
 */
export function renderMixedContent(text: string): string {
  if (!text) return '';

  const normalizedText = normalizeOcrArtifacts(text);
  
  // If it has $ signs, use standard renderLatex
  if (normalizedText.includes('$')) {
    return renderLatex(normalizedText);
  }
  
  // Check if it looks like pure LaTeX
  if (containsLatex(normalizedText)) {
    // If the whole thing looks like LaTeX, render it
    return renderWithKatex(normalizedText, normalizedText.length > 100);
  }
  
  // Otherwise just do basic conversions
  return renderMathText(normalizedText);
}

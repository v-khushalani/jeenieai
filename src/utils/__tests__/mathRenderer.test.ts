import { describe, expect, it } from 'vitest';
import { renderLatex, renderMathText, renderMathTextForPdf } from '../mathRenderer';

describe('mathRenderer OCR normalization', () => {
  it('normalizes OCR matrix notation into readable text', () => {
    const input = '| array ccc 5 & 3 & -1 \\ -7 & x & -3 \\ 9 & 6 & -2 array |= 0';
    const output = renderMathText(input);

    expect(output).toContain('|5 3 -1; -7 x -3; 9 6 -2|= 0');
    expect(output).not.toContain('array');
  });

  it('normalizes OCR degrees, radicals, and noisy unit markers', () => {
    const input = 'angles are 45^(), 60^(), 60^() and AB = AC = 100 ~m with 50 sqrt(3) ~m';
    const output = renderMathText(input);

    expect(output).toContain('45°');
    expect(output).toContain('60°');
    expect(output).toContain('100 m');
    expect(output).toContain('50 √(3) m');
  });

  it('normalizes greek symbols and indexed terms from OCR', () => {
    const input = 'alpha_(1) alpha_(2) + beta gamma = mu_0 I / 2 pi r';
    const output = renderMathText(input);

    expect(output).toContain('α₁');
    expect(output).toContain('α₂');
    expect(output).toContain('β');
    expect(output).toContain('γ');
    expect(output).toContain('μ_0');
    expect(output).toContain('π');
  });

  it('keeps valid latex rendering path intact', () => {
    const output = renderLatex('$\\frac{a}{b} + \\sqrt{x}$');

    expect(output).toContain('class="katex"');
  });

  it('normalizes escaped OCR pseudo-latex matrix blocks before rendering', () => {
    const input = '\\[ array cc 1 & 2 \\\\ 0 & 3 array \\]';
    const output = renderLatex(input);

    expect(output).toContain('[1 2; 0 3]');
    expect(output).not.toContain('array');
    expect(output).not.toContain('katex-error');
  });

  it('converts OCR and LaTeX into stable plain text for PDF export', () => {
    const input = '\\[ array ccc 5 & 3 & -1 \\\\ -7 & x & -3 \\\\ 9 & 6 & -2 array \\] = 0 and alpha_(1)+beta with 50 sqrt(3) ~m';
    const output = renderMathTextForPdf(input);

    expect(output).toContain('[5 3 -1; -7 x -3; 9 6 -2] = 0');
    expect(output).toContain('alpha1+beta');
    expect(output).toContain('50 sqrt(3) m');
    expect(output).not.toContain('array');
  });
});

describe('mathRenderer artifact fixes', () => {
  it('converts <sub> and <sup> HTML tags into LaTeX subscripts/superscripts', () => {
    const input = 'V<sub>max</sub> = αt<sub>1</sub> = βt<sub>2</sub>, x<sup>2</sup>';
    const output = renderMathText(input);
    expect(output).not.toContain('<sub>');
    expect(output).not.toContain('< sub >');
    expect(output).toContain('₁');
    expect(output).toContain('₂');
  });

  it('keeps backslash-prefixed LaTeX commands intact (\\omega is not split)', () => {
    const input = 'since 100\\omega through';
    const output = renderMathText(input);
    expect(output).toContain('\\omega');
    expect(output).not.toContain('\\ω');
  });

  it('repairs UTF-8 mojibake like Ã— and Î¿', () => {
    const input = '1.25 Ã— 10^19 and O Î¿ at Â°C';
    const output = renderMathText(input);
    expect(output).toContain('×');
    expect(output).toContain('ο');
    expect(output).toContain('°');
    expect(output).not.toContain('Ã');
    expect(output).not.toContain('Î');
  });

  it('converts vector hat notation x ^ into combining circumflex', () => {
    const input = '-1) x ^, y ^, z ^ are unit vectors';
    const output = renderMathText(input);
    expect(output).toContain('x\u0302');
    expect(output).toContain('y\u0302');
    expect(output).toContain('z\u0302');
  });

  it('collapses OCR letter-spacing in chemistry words', () => {
    const input = 'M o l e f r a c t i o n o f M i n s o l u t i o n';
    const output = renderMathText(input);
    // segmenter should reintroduce word breaks
    expect(output.toLowerCase()).toContain('mole');
    expect(output.toLowerCase()).toContain('fraction');
    expect(output.toLowerCase()).toContain('solution');
    expect(output).not.toMatch(/\bM o l e\b/);
  });

  it('joins letter-spaced chemical formula tokens', () => {
    const input = 'C o e n 2 B r C l N O 3';
    const output = renderMathText(input);
    expect(output).toContain('Coen2BrClNO3');
  });
});

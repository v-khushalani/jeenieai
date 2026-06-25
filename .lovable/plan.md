## Goal
Make weird artifacts in question text disappear at render time — no DB changes, no risk to imported content. One file: `src/utils/mathRenderer.ts`.

## Artifacts to fix (from your screenshots)

| Pattern seen | Cause | Fix |
|---|---|---|
| `t < sub > 1 < /sub >` | HTML `<sub>`/`<sup>` passed into KaTeX, which treats `<` as a relation operator | Pre-convert `<sub>x</sub>` → `_{x}`, `<sup>x</sup>` → `^{x}` before LaTeX detection |
| `100\ω throu` | Greek-word regex matched `omega` inside `\omega`, replacing only the word | Add negative lookbehind for `\\` in greek-word regex so `\omega` stays intact for KaTeX |
| `1.25 Ã 10¹⁹`, `O Î¿`, `O Î¾` | UTF-8 double-encoded (mojibake) from importer | Add mojibake repair table: `Ã—`→`×`, `Ã·`→`÷`, `Î¼`→`μ`, `Î©`→`Ω`, `Î¿`→`ο`, `Î¾`→`ξ`, `Â°`→`°`, `Â±`→`±`, `â€"`→`–`, `â€™`→`'`, `â€œ`/`â€`→`"`/`"`, plus the generic `Ã` + low-ASCII pair → reconstruct via `decodeURIComponent(escape(...))` fallback for unknown pairs |
| `x ^, y ^, z ^` | Vector hat notation lost its argument | Convert standalone ` ^` after a single letter to Unicode hat: `x ^` → `x̂` (combining circumflex U+0302) |
| `C o e n 2 B r C l N O 3`, `M o l e f r a c t i o n o f 'M' i n s o l u t i o n` | OCR letter-spacing artifact (every char separated by single space) | Heuristic: detect runs of 4+ consecutive single-letter tokens separated by single spaces → collapse to a word; restore word boundaries on common stems (`Mole`, `fraction`, `solution`, `vapour`, `phase`) via a small word-break pass using a dictionary of frequent chem/physics terms |
| `\[ array … array \]` etc. | Already handled | Keep existing OCR-matrix path |

## Implementation outline (single file, no behavior change for already-clean text)

1. **New `repairMojibake(text)`** — runs first in `normalizeOcrArtifacts`. Static replacement table for the ~20 most common double-encoded sequences seen in JEE/NEET content.
2. **New `normalizeHtmlMathTags(text)`** — runs before `containsLatex` check in `renderLatex` and inside `renderMathText`. Regexes:
   - `/<\s*sub\s*>([\s\S]*?)<\s*\/\s*sub\s*>/gi` → `_{ $1 }` (or subscript-unicode if single digit)
   - `/<\s*sup\s*>([\s\S]*?)<\s*\/\s*sup\s*>/gi` → `^{ $1 }`
   - Also strip stray `<br>`, `<p>`, `<span>` that slipped through.
3. **Fix Greek-word regex** in `normalizeOcrArtifacts`: change `(alpha|beta|…)(?![A-Za-z])` to `(?<![\\\\A-Za-z])(alpha|beta|…)(?![A-Za-z])` so `\omega` is left for KaTeX.
4. **New `normalizeVectorHats(text)`** — `/\b([A-Za-z])\s*\^(?![{(0-9])/g` → `$1\u0302` (combining hat). Skips real exponents.
5. **New `collapseOcrLetterSpacing(text)`** — only triggers when a span has 4+ single-letter tokens in a row; joins them, then runs a small word-segmenter against a frequency list of ~150 chemistry/physics words (Mole, fraction, solution, vapour, phase, ionisation, isomers, given, compound, particular, point, temperature, statements, correct, etc.) to reintroduce spaces. Conservative: if segmentation confidence is low, leaves joined token as-is rather than guessing.
6. **Pipeline order** in `normalizeOcrArtifacts`:
   `repairMojibake → normalizeHtmlMathTags → existing OCR matrix/greek/sqrt → normalizeVectorHats → collapseOcrLetterSpacing → existing whitespace cleanup`

## Verification

- Add unit tests in `src/utils/__tests__/mathRenderer.test.ts` covering each artifact from your screenshots.
- Manually re-open the same questions in StudyNow / TestPage to confirm.
- Run `bunx vitest run` for the renderer suite.

## Risk

- **Zero DB risk** — display-only.
- **Low regression risk** — all transforms are additive and guarded (vector-hat regex skips exponents, letter-spacing collapser requires 4+ run, mojibake table only touches known pairs).
- Per-render cost: negligible (string regexes on already-short question text, KaTeX itself dominates).

## Files touched

- `src/utils/mathRenderer.ts` — add 4 helpers, wire into pipeline, fix greek regex.
- `src/utils/__tests__/mathRenderer.test.ts` — add ~8 new test cases.

No DB migrations, no edge functions, no schema changes.
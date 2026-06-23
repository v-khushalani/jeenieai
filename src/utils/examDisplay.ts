/**
 * Format an internal exam token (e.g. "JEE_MAINS", "JEE_ADVANCED", "MH_CET",
 * "NEET", "Foundation-9") into a user-friendly display string ("JEE Mains",
 * "JEE Advanced", "MH CET", "NEET", "Foundation 9").
 */
export function formatExamDisplay(exam?: string | null): string {
  if (!exam) return 'JEE';
  const raw = String(exam).trim();
  if (!raw) return 'JEE';

  // Replace underscores/hyphens with spaces and normalize
  const cleaned = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Title-case while keeping common acronyms uppercase
  const ACRONYMS = new Set(['JEE', 'NEET', 'MH', 'CET', 'CBSE', 'ICSE', 'IIT', 'AIIMS', 'NDA']);
  return cleaned
    .split(' ')
    .map((word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper)) return upper;
      if (/^\d+$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (lower === 'mains') return 'Mains';
      if (lower === 'advanced') return 'Advanced';
      if (lower === 'foundation') return 'Foundation';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

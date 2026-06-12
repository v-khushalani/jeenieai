export function sanitizeRoast(input?: string | null, maxLen = 220) {
  if (!input) return '';
  let s = String(input || '');

  // Normalize line endings and trim
  const lines = s.split(/\r?\n/).map(l => l.trim());

  // Drop leading salutations/greetings (Hello, Hey, Namaste, Puttar, Bhai, Beta, etc.)
  while (lines.length > 0 && /^\s*(?:[*"'`\-—•]*)\s*(?:hello|hey|hi|namaste|salaam|salam|dear|puttar|bhai|beta|yo|hiya)\b[:!,.\-\s]*/i.test(lines[0])) {
    lines.shift();
  }

  // Join remaining lines and remove any leading metadata like "JEEnie:"
  s = lines.join(' ').replace(/^[A-Za-z0-9_\- ]{0,30}:\s*/i, '').trim();

  // Remove obvious salutations embedded at start like "Hello Puttar!" in bold/markdown
  s = s.replace(/^\*{0,2}\s*hello\b[^\w\n]*\s*/i, '');

  // Remove HTML tags, leftover markdown formatting and quotes
  s = s.replace(/<[^>]+>/g, '').replace(/[*_`~]+/g, '').trim();

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ');

  // Trim to max length without cutting mid-word if possible
  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > Math.floor(maxLen * 0.6)) s = s.slice(0, lastSpace);
    s = s.trim() + (s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? '' : '...');
  }

  // Final safety: remove any leading punctuation
  s = s.replace(/^["'`\-—:.\s]+/, '').trim();

  return s;
}

export default sanitizeRoast;

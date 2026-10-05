export function sanitizeRoast(input?: string | null, maxLen = 400) {
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

  // Only trim pathological outputs, and only at a sentence boundary — never mid-punchline.
  if (s.length > maxLen) {
    const head = s.slice(0, maxLen);
    const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
    if (end > maxLen * 0.4) s = head.slice(0, end + 1).trim();
  }

  // Final safety: remove any leading punctuation
  s = s.replace(/^["'`\-—:.\s]+/, '').trim();

  return s;
}

export default sanitizeRoast;

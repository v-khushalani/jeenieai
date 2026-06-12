export function formatSubjectDisplay(subject?: string | null, chapter?: string | null) {
  const s = (subject || '').toString().trim();
  const c = (chapter || '').toString().trim();

  if (!s) {
    return c ? `General — ${c}` : 'General';
  }

  const normalized = s.toLowerCase();
  if (normalized === 'general' || normalized === 'miscellaneous' || normalized === 'misc') {
    return c ? `General — ${c}` : 'General';
  }

  return s;
}

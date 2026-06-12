export function getExamDateForGrade(examDate: string | null | undefined, grade?: number | null): string | null {
  if (!examDate) return null;

  const parsed = new Date(examDate);
  if (Number.isNaN(parsed.getTime())) return null;

  if (grade === 12) {
    parsed.setFullYear(parsed.getFullYear() + 1);
  } else if (grade === 11) {
    parsed.setFullYear(parsed.getFullYear() + 2);
  }

  return parsed.toISOString().slice(0, 10);
}

export function getDaysUntilDate(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;

  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return null;

  const diff = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}
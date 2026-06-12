const SUBJECT_ALIASES: Record<string, string[]> = {
  Physics: ['Physics', 'PHYSICS'],
  Chemistry: ['Chemistry', 'CHEMISTRY'],
  Mathematics: ['Mathematics', 'Maths', 'Math', 'MATHEMATICS', 'MATHS', 'MATH'],
  Biology: ['Biology', 'Bio', 'BIOLOGY', 'BIO'],
};

export function normalizeSubject(subject: string): string {
  const normalized = subject.trim().toLowerCase();

  if (normalized === 'physics' || normalized.includes('phys')) return 'Physics';
  if (normalized === 'chemistry' || normalized.includes('chem')) return 'Chemistry';
  if (normalized === 'mathematics' || normalized === 'maths' || normalized === 'math' || normalized.includes('math')) return 'Mathematics';
  if (normalized === 'biology' || normalized === 'bio' || normalized.includes('bio')) return 'Biology';

  return subject.trim();
}

export function getSubjectAliases(subject: string): string[] {
  const canonicalSubject = normalizeSubject(subject);
  return SUBJECT_ALIASES[canonicalSubject] || [canonicalSubject];
}
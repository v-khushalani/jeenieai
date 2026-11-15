export interface PracticeScope {
  chapterId: string;
  topicId: string;
  topicName: string;
}

/** Exhaustion broadens only to the parent chapter, never another exam or solved pool. */
export async function fetchFreshPractice<T>(
  scope: PracticeScope,
  fetch: (scope: PracticeScope) => Promise<T[]>,
): Promise<{ questions: T[]; expanded: boolean }> {
  const questions = await fetch(scope);
  if (questions.length || !scope.chapterId || (!scope.topicId && !scope.topicName)) {
    return { questions, expanded: false };
  }
  return {
    questions: await fetch({ ...scope, topicId: '', topicName: '' }),
    expanded: true,
  };
}

export interface PracticeAttemptState {
  question_id: string;
  is_correct: boolean | null;
  attempted_at?: string | null;
  created_at?: string | null;
}

export function unresolvedMistakes(rows: PracticeAttemptState[], repaired: Set<string>, dueBefore = Infinity): string[] {
  const latest = new Map<string, PracticeAttemptState>();
  for (const row of rows) {
    const previous = latest.get(row.question_id);
    const time = (attempt: PracticeAttemptState) => new Date(attempt.attempted_at || attempt.created_at || 0).getTime();
    if (!previous || time(row) > time(previous)) latest.set(row.question_id, row);
  }
  return [...latest.values()]
    .filter(row => row.is_correct === false && !repaired.has(row.question_id)
      && new Date(row.attempted_at || row.created_at || 0).getTime() <= dueBefore)
    .map(row => row.question_id);
}
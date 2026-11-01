import type { AssessmentAnswer } from './assessmentContract';

export interface SavedDraft { response: AssessmentAnswer; revision: number }
export function shouldFlushDrafts(expiresAt: string | undefined, remaining: number, pendingCompletion: boolean, now = Date.now()): boolean {
  return !pendingCompletion && (expiresAt ? now < new Date(expiresAt).getTime() : remaining > 0);
}
export function draftSelection(response: AssessmentAnswer): string {
  if (response.kind === 'options') return response.values.slice().sort().join(',');
  if (response.kind === 'numerical') return `NUM:${response.value}`;
  return '';
}

// Serialize edits per item; a lost acknowledgement is reconciled by the server's
// same-response/revision retry rule. A conflict is never silently discarded.
export class AssessmentDraftQueue {
  private revisions = new Map<string, number>();
  private selections = new Map<string, string>();
  private tail: Promise<void> = Promise.resolve();
  restore(drafts: Record<string, SavedDraft>) {
    this.revisions.clear(); this.selections.clear();
    for (const [id, draft] of Object.entries(drafts)) {
      this.revisions.set(id, draft.revision);
      this.selections.set(id, draftSelection(draft.response));
    }
  }
  enqueue(id: string, selection: string, save: (revision: number) => Promise<{ revision: number }>) {
    const work = this.tail.then(async () => {
      if (this.selections.get(id) === selection) return;
      const result = await save(this.revisions.get(id) ?? 0);
      this.revisions.set(id, result.revision);
      this.selections.set(id, selection);
    });
    this.tail = work.catch(() => undefined);
    return work;
  }
}
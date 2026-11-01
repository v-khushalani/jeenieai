import { describe, expect, it, vi } from 'vitest';
import { AssessmentDraftQueue, draftSelection } from '../modules/assessmentDrafts';

describe('trusted draft recovery', () => {
  it('restores saved answers and revision 7 instead of restarting at zero', async () => {
    const queue = new AssessmentDraftQueue();
    queue.restore({ q: { response: { kind: 'options', values: ['A'] }, revision: 7 } });
    const save = vi.fn().mockResolvedValue({ revision: 8 });
    await queue.enqueue('q', 'B', save);
    expect(save).toHaveBeenCalledWith(7);
  });
  it('serializes rapid edits with successive revisions', async () => {
    const queue = new AssessmentDraftQueue();
    const revisions: number[] = [];
    const save = async (revision: number) => { revisions.push(revision); return { revision: revision + 1 }; };
    await Promise.all([queue.enqueue('q', 'A', save), queue.enqueue('q', 'B', save)]);
    expect(revisions).toEqual([0, 1]);
  });
  it('surfaces failure and retries the unacknowledged revision', async () => {
    const queue = new AssessmentDraftQueue();
    const save = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ revision: 1 });
    await expect(queue.enqueue('q', 'A', save)).rejects.toThrow('connection lost');
    await queue.enqueue('q', 'A', save);
    expect(save.mock.calls).toEqual([[0], [0]]);
  });
  it('keeps recovered numerical and multi-correct responses intact', () => {
    expect(draftSelection({ kind: 'numerical', value: '-12.5' })).toBe('NUM:-12.5');
    expect(draftSelection({ kind: 'options', values: ['C', 'A'] })).toBe('A,C');
  });
});
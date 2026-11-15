import { expect, it, vi } from 'vitest';
import { fetchFreshPractice, unresolvedMistakes } from '../practiceFeed';

it('expands an exhausted topic to unseen questions in the same parent chapter', async () => {
  const fetch = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'fresh' }]);
  const result = await fetchFreshPractice({ chapterId: 'chapter', topicId: 'topic', topicName: 'name' }, fetch);
  expect(fetch.mock.calls[1][0]).toEqual({ chapterId: 'chapter', topicId: '', topicName: '' });
  expect(result.questions).toEqual([{ id: 'fresh' }]);
});
it('stops when the chapter is exhausted instead of recycling', async () => {
  const fetch = vi.fn().mockResolvedValue([]);
  expect((await fetchFreshPractice({ chapterId: 'chapter', topicId: '', topicName: '' }, fetch)).questions).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not broaden on a failed request', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('offline'));
  await expect(fetchFreshPractice({ chapterId: 'chapter', topicId: 'topic', topicName: '' }, fetch)).rejects.toThrow('offline');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('excludes corrected and locally repaired questions from both repair modes', () => {
  expect(unresolvedMistakes([
    { question_id: 'fixed', is_correct: false, attempted_at: '2026-11-01' },
    { question_id: 'fixed', is_correct: true, attempted_at: '2026-11-02' },
    { question_id: 'local', is_correct: false },
    { question_id: 'wrong', is_correct: false },
  ], new Set(['local']))).toEqual(['wrong']);
});
it('interleaves only mistakes at least one day old', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  expect(unresolvedMistakes([
    { question_id: 'old', is_correct: false, attempted_at: '2026-11-14T11:00:00Z' },
    { question_id: 'today', is_correct: false, attempted_at: '2026-11-15T11:00:00Z' },
  ], new Set(), now - 864e5)).toEqual(['old']);
});
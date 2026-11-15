import { beforeEach, expect, it, vi } from 'vitest';
const { insert, update, eq, is, select, from } = vi.hoisted(() => ({
  insert: vi.fn(), update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), from: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { savePracticeAttempt } from '../practiceAttempts';
const answer = { userId: 'student', questionId: 'question', selectedOption: 'B', selectedOptions: ['B'], correct: true, seconds: 30 };
beforeEach(() => {
  vi.resetAllMocks();
  const chain = { insert, update, eq, is, select };
  from.mockReturnValue(chain);
  update.mockReturnValue(chain);
  eq.mockReturnValue(chain);
  is.mockReturnValue(chain);
});
it('persists a corrected practice retry, scoped to its student and question', async () => {
  insert.mockResolvedValue({ error: { code: '23505' } });
  select.mockResolvedValue({ data: [{ id: 'attempt' }], error: null });
  expect(await savePracticeAttempt(answer)).toBe(true);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_correct: true, selected_option: 'B', time_spent: 30 }));
  expect(eq).toHaveBeenCalledWith('user_id', 'student');
  expect(eq).toHaveBeenCalledWith('question_id', 'question');
});
it('never overwrites a test-linked attempt when practicing the same question', async () => {
  insert.mockResolvedValue({ error: { code: '23505' } });
  select.mockResolvedValue({ data: [], error: null });
  expect(await savePracticeAttempt(answer)).toBe(false);
  expect(eq).toHaveBeenCalledWith('mode', 'practice');
  expect(is).toHaveBeenCalledWith('test_session_id', null);
});
it('surfaces failed saves instead of silently marking them synced', async () => {
  insert.mockResolvedValue({ error: { code: '23505' } });
  select.mockResolvedValue({ data: null, error: { code: '42501' } });
  await expect(savePracticeAttempt(answer)).rejects.toEqual({ code: '42501' });
});
it('does not update a newly saved first attempt', async () => {
  insert.mockResolvedValue({ error: null });
  expect(await savePracticeAttempt(answer)).toBe(true);
  expect(update).not.toHaveBeenCalled();
});
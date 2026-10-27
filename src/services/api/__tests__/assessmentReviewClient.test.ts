import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAssessmentReviewClient } from '../modules/assessmentReviewClient';

const assessmentId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const input = { assessmentId, itemId, idempotencyKey: requestId, answer: { kind: 'options', values: ['A'] } };

function fixture(response: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data: response, error });
  return { rpc, api: createAssessmentReviewClient({ rpc } as unknown as SupabaseClient) };
}

describe('unwired assessment review adapter', () => {
  it('sends the same idempotency key unchanged on retry', async () => {
    const { rpc, api } = fixture({ accepted: true });
    await api.submit(input);
    await api.submit(input);
    expect(rpc).toHaveBeenNthCalledWith(1, 'submit_assessment_answer', { p_assessment_id: assessmentId, p_item_id: itemId, p_answer: input.answer, p_request_id: requestId });
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
  });
  it('never converts a failed server request into a locally correct or wrong answer', async () => {
    const { rpc, api } = fixture(null, { code: '42501', message: 'private details' });
    await expect(api.submit(input)).rejects.toThrow('42501');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('does not send a forged outcome to the server', async () => {
    const { rpc, api } = fixture({ accepted: true });
    await expect(api.submit({ ...input, is_correct: true })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects solution data in submission acknowledgements', async () => {
    const { api } = fixture({ accepted: true, result: { explanation: 'private' } });
    await expect(api.submit(input)).rejects.toThrow('protected');
  });
  it('retrieves solutions only through the distinct review operation', async () => {
    const { rpc, api } = fixture({ items: [{ correct_option: 'A' }] });
    await api.review(assessmentId);
    expect(rpc).toHaveBeenCalledWith('get_assessment_review', { p_assessment_id: assessmentId });
    expect(rpc).not.toHaveBeenCalledWith('validate_practice_answer', expect.anything());
  });
});
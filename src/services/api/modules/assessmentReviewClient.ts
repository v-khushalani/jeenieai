import type { SupabaseClient } from '@supabase/supabase-js';
import { assessmentSubmissionSchema, assertKeyFreePayload, type IssuedAssessment } from './assessmentContract';

// Unwired review adapter. These RPCs are not yet applied. Importing this module
// does not enable them or grant access; never use it as a local grading fallback.
export function createAssessmentReviewClient(client: SupabaseClient) {
  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(`Assessment request rejected (${error.code ?? 'unknown'})`);
    if (!data || typeof data !== 'object') throw new Error('Assessment response unavailable');
    return data;
  }

  return {
    async get(assessmentId: string): Promise<IssuedAssessment> {
      const data = await call('get_assessment', { p_assessment_id: assessmentId });
      assertKeyFreePayload(data);
      return data as IssuedAssessment;
    },
    async submit(input: unknown): Promise<unknown> {
      const submission = assessmentSubmissionSchema.parse(input);
      // Submission acknowledges committed acceptance; solutions come from the
      // independently authorized review RPC, never a bare-question validator.
      const data = await call('submit_assessment_answer', {
        p_assessment_id: submission.assessmentId,
        p_item_id: submission.itemId,
        p_answer: submission.answer,
        p_request_id: submission.idempotencyKey,
      });
      assertKeyFreePayload(data);
      return data;
    },
    async review(assessmentId: string): Promise<unknown> {
      // Never cache released solutions in a shared/global question cache.
      return call('get_assessment_review', { p_assessment_id: assessmentId });
    },
  };
}
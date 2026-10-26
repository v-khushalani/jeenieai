import { z } from 'zod';

// Review-only contract. No screen uses these endpoints until the migration and
// complete dependent-flow diff are approved together.
export const assessmentAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('options'), values: z.array(z.enum(['A', 'B', 'C', 'D'])).min(1).max(4)
    .refine(values => new Set(values).size === values.length, 'Duplicate options') }).strict(),
  z.object({ kind: z.literal('numerical'), value: z.string().max(64)
    .regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)$/, 'Finite decimal required') }).strict(),
  z.object({ kind: z.literal('skip') }).strict(),
  z.object({ kind: z.literal('timeout') }).strict(),
]);

export type AssessmentAnswer = z.infer<typeof assessmentAnswerSchema>;

export const assessmentSubmissionSchema = z.object({
  assessmentId: z.string().uuid(),
  itemId: z.string().uuid(),
  answer: assessmentAnswerSchema,
  idempotencyKey: z.string().uuid(),
}).strict();

export const protectedAnswerFields = new Set([
  'correct_option', 'correct_options', 'correct_answer', 'numerical_answer',
  'numerical_tolerance', 'explanation', 'explanation_image_url',
  'correctOption', 'correctOptions', 'correctAnswer', 'numericalAnswer',
  'numericalTolerance', 'explanationImageUrl', 'solution', 'answer_key',
  'previous_answer', 'previous_explanation',
]);

// Fail closed on answer-bearing data in an issuance/draft acknowledgement,
// including nested relationships. This supplements, never replaces, SQL grants.
export function assertKeyFreePayload(payload: unknown): void {
  if (Array.isArray(payload)) {
    payload.forEach(assertKeyFreePayload);
    return;
  }
  if (!payload || typeof payload !== 'object') return;
  for (const [key, value] of Object.entries(payload)) {
    if (protectedAnswerFields.has(key)) throw new Error('Unexpected protected assessment field');
    assertKeyFreePayload(value);
  }
}

export interface IssuedAssessment {
  assessment_id: string;
  purpose: 'practice' | 'class_recap' | 'test';
  issued_at: string;
  expires_at: string;
  items: Array<{
    item_id: string;
    question_id: string;
    position: number;
    version: string;
    question: Record<string, unknown>;
  }>;
}
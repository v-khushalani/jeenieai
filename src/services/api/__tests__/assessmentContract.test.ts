import { describe, expect, it } from 'vitest';
import { assessmentAnswerSchema, assessmentSubmissionSchema, assertKeyFreePayload } from '../modules/assessmentContract';

describe('review-only assessment submission contract', () => {
  it('requires issuance and item UUIDs rather than a bare question ID', () => {
    expect(assessmentSubmissionSchema.safeParse({ questionId: 'f87211d7-0852-4f55-b597-153804bced96', answer: { kind: 'options', values: ['A'] } }).success).toBe(false);
  });
  it('does not accept an empty response as a submission', () => {
    expect(assessmentAnswerSchema.safeParse({ kind: 'options', values: [] }).success).toBe(false);
    expect(assessmentAnswerSchema.safeParse(null).success).toBe(false);
  });
  it('makes skip and timeout explicit and prevents attached answers', () => {
    expect(assessmentAnswerSchema.safeParse({ kind: 'skip' }).success).toBe(true);
    expect(assessmentAnswerSchema.safeParse({ kind: 'timeout' }).success).toBe(true);
    expect(assessmentAnswerSchema.safeParse({ kind: 'timeout', values: ['A'] }).success).toBe(false);
  });
  it('rejects duplicate choices and forged correctness', () => {
    expect(assessmentAnswerSchema.safeParse({ kind: 'options', values: ['A', 'A'] }).success).toBe(false);
    expect(assessmentAnswerSchema.safeParse({ kind: 'options', values: ['A'], is_correct: true }).success).toBe(false);
  });
  it('rejects non-finite numerical responses', () => {
    for (const value of ['NaN', 'Infinity', '-Infinity', '1e999', '']) {
      expect(assessmentAnswerSchema.safeParse({ kind: 'numerical', value }).success).toBe(false);
    }
    expect(assessmentAnswerSchema.safeParse({ kind: 'numerical', value: '-12.5' }).success).toBe(true);
  });
  it('rejects answer fields in nested issuance relationships', () => {
    expect(() => assertKeyFreePayload({ items: [{ question: { correct_option: 'A' } }] })).toThrow();
    expect(() => assertKeyFreePayload({ items: [{ history: { previous_explanation: 'private' } }] })).toThrow();
  });
  it('accepts key-free issued question data', () => {
    expect(() => assertKeyFreePayload({ items: [{ question: { id: 'q', option_a: 'x', question_type: 'numerical_int' } }] })).not.toThrow();
  });
});
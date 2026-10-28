import { supabase } from '@/integrations/supabase/client';
import { assertKeyFreePayload, assessmentAnswerSchema } from './assessmentContract';

export interface AssessmentQuestion {
  id: string;
  item_id: string;
  assessment_id: string;
  question: string;
  question_text?: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  question_type?: string | null;
  subject?: string;
  difficulty?: string;
  [key: string]: unknown;
}
export interface AssessmentSession {
  id: string;
  sessionId: string;
  title: string;
  subject?: string;
  duration: number;
  startTime: string;
  expiresAt: string;
  examPattern: string;
  questions: AssessmentQuestion[];
  status: string;
  [key: string]: unknown;
}
export interface ReleasedAnswer {
  questionId: string;
  is_correct: boolean;
  correct_option?: string;
  correct_options?: string[];
  numerical_answer?: number | null;
  explanation?: string;
  [key: string]: unknown;
}
export async function assessmentRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // Generated DB types remain untouched until an approved migration is applied.
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw new Error(`Assessment unavailable (${error.code}). Please retry later.`);
  if (data == null) throw new Error('Assessment response unavailable');
  return data as T;
}
export function selectedResponse(selected: string) {
  if (!selected) return { kind: 'skip' as const };
  return assessmentAnswerSchema.parse(selected.startsWith('NUM:')
    ? { kind: 'numerical', value: selected.slice(4) }
    : { kind: 'options', values: selected.split(',').map(v => v.trim().toUpperCase()) });
}
export const assessmentsAPI = {
  async issue(config: Record<string, unknown>, requestId = crypto.randomUUID()) {
    const session = await assessmentRpc<AssessmentSession>('issue_assessment', { p_config: config, p_request_id: requestId });
    assertKeyFreePayload(session);
    return session;
  },
  async get(id: string) {
    const session = await assessmentRpc<AssessmentSession>('get_assessment', { p_assessment_id: id });
    assertKeyFreePayload(session);
    return session;
  },
  async submit(question: Pick<AssessmentQuestion, 'assessment_id' | 'item_id'>, response: unknown, requestId: string) {
    const answer = assessmentAnswerSchema.parse(response);
    const receipt = await assessmentRpc<{ accepted: boolean; is_correct?: boolean; points?: number }>('submit_assessment_answer', {
      p_assessment_id: question.assessment_id, p_item_id: question.item_id, p_answer: answer, p_request_id: requestId,
    });
    assertKeyFreePayload(receipt);
    return receipt;
  },
  async feedback(id: string, questionId: string): Promise<ReleasedAnswer> {
    const review = await this.review(id);
    const answer = review.results.find(r => r.questionId === questionId);
    if (!answer) throw new Error('Feedback not yet available');
    return answer;
  },
  async complete(id: string, answers: Record<string, unknown>, requestId: string) {
    const receipt = await assessmentRpc<{ accepted: boolean; id: string }>('complete_assessment', {
      p_assessment_id: id, p_answers: answers, p_request_id: requestId,
    });
    assertKeyFreePayload(receipt);
    return receipt;
  },
  async review(id: string) {
    return assessmentRpc<{ session: Record<string, unknown>; questions: AssessmentQuestion[]; results: ReleasedAnswer[]; answers: Record<string, { selectedOption: string; isCorrect: boolean; timeSpent: number }> }>('get_assessment_review', { p_assessment_id: id });
  },
  async createGroup(config: Record<string, unknown>, requestId = crypto.randomUUID()) {
    return assessmentRpc<{ id: string; code: string }>('create_secure_group_test', { p_config: config, p_request_id: requestId });
  },
};
import { supabase } from '@/integrations/supabase/client';

interface PracticeSubmission {
  userId: string;
  questionId: string;
  selectedOption: string;
  selectedOptions: string[];
  correct: boolean;
  seconds: number;
}

/** Existing test-linked attempts are never rewritten by practice. */
export async function savePracticeAttempt(answer: PracticeSubmission): Promise<boolean> {
  const fields = {
    selected_option: answer.selectedOption,
    selected_options: answer.selectedOptions,
    is_correct: answer.correct,
    time_spent: answer.seconds,
    attempted_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('question_attempts').insert({
    ...fields, user_id: answer.userId, question_id: answer.questionId, mode: 'practice',
  });
  if (!error) return true;
  if (error.code !== '23505') throw error;
  const { data, error: retryError } = await supabase.from('question_attempts')
    .update(fields)
    .eq('user_id', answer.userId)
    .eq('question_id', answer.questionId)
    .eq('mode', 'practice')
    .is('test_session_id', null)
    .select('id');
  if (retryError) throw retryError;
  return !!data?.length;
}
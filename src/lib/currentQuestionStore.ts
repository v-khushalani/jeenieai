// Lightweight global store for the "currently visible" question.
// Used so the floating AI Doubt Solver can auto-pick up the question
// the user is looking at on PracticePage / TestAttemptPage etc.
//
// Pages call setCurrentJeenieQuestion(...) on mount / question change
// and clear it on unmount. The AI button reads via getCurrentJeenieQuestion().

import { useEffect, useSyncExternalStore } from 'react';

export interface JeenieQuestionContext {
  question: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
}

let current: JeenieQuestionContext | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const setCurrentJeenieQuestion = (q: JeenieQuestionContext | null) => {
  current = q;
  emit();
};

export const getCurrentJeenieQuestion = (): JeenieQuestionContext | null => current;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const useCurrentJeenieQuestion = () =>
  useSyncExternalStore(subscribe, getCurrentJeenieQuestion, () => null);

/**
 * Hook for pages to register the currently-visible question.
 * Auto-clears on unmount or when q becomes null.
 */
export const useRegisterJeenieQuestion = (q: JeenieQuestionContext | null | undefined) => {
  useEffect(() => {
    if (q && q.question) {
      setCurrentJeenieQuestion(q);
    } else {
      setCurrentJeenieQuestion(null);
    }
    return () => setCurrentJeenieQuestion(null);
  }, [q?.question, q?.option_a, q?.option_b, q?.option_c, q?.option_d]); // eslint-disable-line react-hooks/exhaustive-deps
};

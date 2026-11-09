// A wrong question re-solved correctly counts as "repaired". The first attempt
// stays the official record (one attempt row per user+question), so repairs are
// tracked here per device and subtracted from the planner's pending mistakes.
import safeLocalStorage from '@/utils/safeStorage';

const KEY = (uid: string) => `jeenie:repaired:${uid}`;

export function getRepairedIds(userId: string): Set<string> {
  try {
    const raw = safeLocalStorage.getItem(KEY(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markRepaired(userId: string, questionId: string): void {
  const s = getRepairedIds(userId);
  if (s.has(questionId)) return;
  s.add(questionId);
  try { safeLocalStorage.setItem(KEY(userId), JSON.stringify([...s].slice(-2000))); } catch { /* ignore */ }
}

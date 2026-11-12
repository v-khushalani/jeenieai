// Original attempt rows remain unchanged. Repair evidence is device-local;
// two correct retries at least seven days apart retire a mistake.
import safeLocalStorage from '@/utils/safeStorage';
interface Repair { firstCorrectAt: string | null; repaired: boolean }
const progressKey = (uid: string) => `jeenie:repair-progress:v2:${uid}`;
function readProgress(uid: string): Record<string, Repair> {
  try { return JSON.parse(safeLocalStorage.getItem(progressKey(uid)) || '{}'); }
  catch { return {}; }
}
export function getRepairedIds(userId: string): Set<string> {
  const progress = readProgress(userId);
  return new Set(Object.entries(progress).filter(([, r]) => r.repaired).map(([id]) => id));
}
export function recordRepairAttempt(userId: string, questionId: string, correct: boolean, at = new Date().toISOString()): void {
  const progress = readProgress(userId);
  const old = progress[questionId];
  const elapsed = old?.firstCorrectAt ? new Date(at).getTime() - new Date(old.firstCorrectAt).getTime() : 0;
  progress[questionId] = !correct ? { firstCorrectAt: null, repaired: false } :
    { firstCorrectAt: old?.firstCorrectAt || at, repaired: !!old?.firstCorrectAt && elapsed >= 7 * 864e5 };
  safeLocalStorage.setItem(progressKey(userId), JSON.stringify(progress));
}
export function markRepaired(userId: string, questionId: string): void {
  recordRepairAttempt(userId, questionId, true);
}

// Lightweight planner cache — in-memory + localStorage. Enables instant
// render of AIStudyPlanner while a background refresh fetches fresh data.
import safeLocalStorage from '@/utils/safeStorage';

const KEY = (uid: string) => `jeenie:planner:v1:${uid}`;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface Entry<T> {
  data: T;
  computedAt: number;
}

const memory = new Map<string, Entry<any>>();

export function readPlannerCache<T = any>(userId: string): { data: T; ageMs: number } | null {
  if (!userId) return null;
  const mem = memory.get(userId);
  if (mem) return { data: mem.data, ageMs: Date.now() - mem.computedAt };
  try {
    const raw = safeLocalStorage.getItem(KEY(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (!parsed?.computedAt) return null;
    memory.set(userId, parsed);
    return { data: parsed.data, ageMs: Date.now() - parsed.computedAt };
  } catch {
    return null;
  }
}

export function writePlannerCache<T = any>(userId: string, data: T): void {
  if (!userId) return;
  const entry: Entry<T> = { data, computedAt: Date.now() };
  memory.set(userId, entry);
  try {
    safeLocalStorage.setItem(KEY(userId), JSON.stringify(entry));
  } catch { /* quota — ignore */ }
}

export function isFresh(ageMs: number): boolean {
  return ageMs < TTL_MS;
}

export function invalidatePlannerCache(userId: string): void {
  memory.delete(userId);
  try { safeLocalStorage.removeItem(KEY(userId)); } catch { /* ignore */ }
}

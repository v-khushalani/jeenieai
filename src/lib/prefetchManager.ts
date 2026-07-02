// Idle-time prefetch orchestrator. Runs AFTER auth resolves; skips on
// slow/saveData connections. Each task is fire-and-forget and swallows errors.
import { logger } from '@/utils/logger';

type Task = () => Promise<void>;

const started = new Set<string>();

function shouldSkip(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn: any = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  if (conn.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true;
  return false;
}

function schedule(fn: () => void, timeoutMs = 2000) {
  const ric: any = (globalThis as any).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, 800);
  }
}

export function prefetch(id: string, task: Task, opts?: { delayMs?: number }): void {
  if (started.has(id)) return;
  started.add(id);
  if (shouldSkip()) return;
  const run = () => {
    schedule(() => {
      Promise.resolve()
        .then(task)
        .catch((err) => logger.warn?.(`[prefetch:${id}] failed`, err));
    });
  };
  if (opts?.delayMs) setTimeout(run, opts.delayMs);
  else run();
}

export function resetPrefetch(id?: string): void {
  if (id) started.delete(id);
  else started.clear();
}

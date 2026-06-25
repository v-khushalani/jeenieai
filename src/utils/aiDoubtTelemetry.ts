/**
 * Tiny client-side helper for JEEnie doubt-solver telemetry.
 *
 * - Stamps the mode source (`auto` vs `manual_chip` vs `manual_dropdown`)
 *   so the server can record where the chosen mode came from.
 * - Measures end-to-end latency from send → response received.
 *
 * No PII is captured here — only mode metadata and timing.
 */

import type { JeenieMode, JeenieModeSource } from '@/services/api/types';

export interface DoubtTelemetry {
  mode: JeenieMode;
  modeSource: JeenieModeSource;
  startedAt: number;
}

export function beginTelemetry(
  mode: JeenieMode = 'auto',
  modeSource: JeenieModeSource = 'auto',
): DoubtTelemetry {
  return { mode, modeSource, startedAt: Date.now() };
}

export function endTelemetry(t: DoubtTelemetry): number {
  return Date.now() - t.startedAt;
}

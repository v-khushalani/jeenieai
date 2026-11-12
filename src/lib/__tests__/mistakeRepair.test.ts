import { beforeEach, expect, it } from 'vitest';
import { getRepairedIds, recordRepairAttempt } from '../mistakeRepair';
beforeEach(() => localStorage.clear());
it('requires two correct solves seven days apart, not two solves in the same session', () => {
  recordRepairAttempt('u', 'q', true, '2026-11-01T00:00:00Z');
  recordRepairAttempt('u', 'q', true, '2026-11-01T00:01:00Z');
  expect(getRepairedIds('u').has('q')).toBe(false);
  recordRepairAttempt('u', 'q', true, '2026-11-08T00:00:00Z');
  expect(getRepairedIds('u').has('q')).toBe(true);
});
it('an incorrect retry resets spaced repair evidence', () => {
  recordRepairAttempt('u', 'q', true, '2026-11-01T00:00:00Z');
  recordRepairAttempt('u', 'q', false, '2026-11-07T00:00:00Z');
  recordRepairAttempt('u', 'q', true, '2026-11-08T00:00:00Z');
  expect(getRepairedIds('u').has('q')).toBe(false);
});

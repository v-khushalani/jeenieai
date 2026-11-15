import { beforeEach, expect, it } from 'vitest';
import { getRepairedIds, recordRepairAttempt } from '../mistakeRepair';
beforeEach(() => localStorage.clear());
it('retires a mistake after one correct retry immediately', () => {
  recordRepairAttempt('u', 'q', true, '2026-11-01T00:00:00Z');
  expect(getRepairedIds('u').has('q')).toBe(true);
});
it('an incorrect retry resets spaced repair evidence', () => {
  recordRepairAttempt('u', 'q', true, '2026-11-01T00:00:00Z');
  recordRepairAttempt('u', 'q', false, '2026-11-07T00:00:00Z');
  expect(getRepairedIds('u').has('q')).toBe(false);
});
it('keeps retirement isolated by student', () => {
  recordRepairAttempt('u', 'q', true);
  expect(getRepairedIds('other').has('q')).toBe(false);
});
it('honors a correct retry saved under the previous seven-day policy', () => {
  localStorage.setItem('jeenie:repair-progress:v2:u', JSON.stringify({ q: { firstCorrectAt: '2026-11-01', repaired: false } }));
  expect(getRepairedIds('u').has('q')).toBe(true);
});

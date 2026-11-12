import { beforeEach, describe, expect, it } from 'vitest';
import { recordPlannerAnswer, readEvidence, taskComplete, writeEvidence } from '../plannerState';
import type { MissionTask } from '../missionEngine';
const task: MissionTask = { id: 'drill-p', kind: 'drill', title: 'Physics', why: '', href: '', target: 2, minutes: 15 };
beforeEach(() => localStorage.clear());
describe('task-specific evidence', () => {
  it('an open task with no answer evidence is not complete', () => {
    expect(taskComplete(task, undefined)).toBe(false);
  });
  it('two unique questions complete only their own task', () => {
    recordPlannerAnswer('student', task.id, 'a');
    recordPlannerAnswer('student', task.id, 'a');
    expect(taskComplete(task, readEvidence('student')[task.id])).toBe(false);
    recordPlannerAnswer('student', task.id, 'b');
    expect(taskComplete(task, readEvidence('student')[task.id])).toBe(true);
    expect(taskComplete({ ...task, id: 'other' }, readEvidence('student').other)).toBe(false);
  });
  it('analysis requires explicit review confirmation, not question count', () => {
    expect(taskComplete({ ...task, kind: 'analysis' }, { questionIds: ['a', 'b'] })).toBe(false);
    expect(taskComplete({ ...task, kind: 'analysis' }, { questionIds: [], reviewed: true })).toBe(true);
  });
  it('offline acknowledgement can be undone without changing answer evidence', () => {
    writeEvidence('student', task.id, { questionIds: [], offline: true });
    expect(taskComplete(task, readEvidence('student')[task.id])).toBe(true);
    writeEvidence('student', task.id, { questionIds: [] });
    expect(taskComplete(task, readEvidence('student')[task.id])).toBe(false);
  });
});

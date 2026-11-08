import { describe, it, expect } from 'vitest';
import { buildMission, classifyAttempt, deriveCohort, mockLoopStage, computeLeaks, type MissionChapter } from '../missionEngine';

const ch = (id: string, title: string, attempts: number, accuracy: number, pendingMistakes = 0): MissionChapter =>
  ({ id, subject: 'Physics', title, chapterNumber: Number(id), attempts, accuracy, pendingMistakes });
const today = '2026-06-01';

describe('missionEngine', () => {
  it('classifies wrong <45s as careless, wrong >120s as concept gap, correct >240s as slow', () => {
    expect(classifyAttempt(false, 30)).toBe('careless');
    expect(classifyAttempt(false, 150)).toBe('concept');
    expect(classifyAttempt(true, 300)).toBe('slow');
    expect(classifyAttempt(false, 0)).toBe('unknown');
  });

  it('≤90 days is sprint; Class 11 is foundation; 91–240 days is improver', () => {
    expect(deriveCohort(80, 12, 10)).toBe('sprint');
    expect(deriveCohort(500, 11, 80)).toBe('foundation');
    expect(deriveCohort(150, 12, 20)).toBe('improver');
    expect(deriveCohort(80, 12, 10, 'foundation')).toBe('foundation');
  });

  it('72-hour loop: mock → analysis → retest → mock', () => {
    expect(mockLoopStage(null)).toBe(0);
    expect(mockLoopStage(1)).toBe(1);
    expect(mockLoopStage(2)).toBe(2);
    expect(mockLoopStage(3)).toBe(0);
  });

  it('each wrong answer leaks 5 marks and unattempted test questions leak 4', () => {
    const leaks = computeLeaks(
      [{ chapterId: '1', isCorrect: false, timeSec: 20, at: today, testSessionId: null },
       { chapterId: '1', isCorrect: false, timeSec: 200, at: today, testSessionId: null }],
      [{ id: 't', completedAt: today, totalQuestions: 25, attempted: 22, isFullMock: false, title: 'T' }],
      [ch('1', 'Optics', 10, 50)], today);
    expect(leaks.careless).toBe(5);
    expect(leaks.concept).toBe(5);
    expect(leaks.unattempted).toBe(12);
    expect(leaks.topChapter?.id).toBe('1');
  });

  it('a test finished yesterday puts the post-mortem first', () => {
    const m = buildMission({ exam: 'JEE', daysLeft: 150, grade: 12, chapters: [ch('1', 'Optics', 20, 50)], attempts: [],
      tests: [{ id: 'abc', completedAt: '2026-05-31', totalQuestions: 25, attempted: 25, isFullMock: false, title: 'Optics test' }], todayIso: today });
    expect(m.tasks[0].kind).toBe('analysis');
    expect(m.tasks[0].href).toBe('/test-results/abc');
  });

  it('improver drills the chapter that leaked the most marks', () => {
    const m = buildMission({ exam: 'JEE', daysLeft: 150, grade: 12,
      chapters: [ch('1', 'Current Electricity', 30, 40), ch('2', 'Ray Optics', 30, 65)],
      attempts: [0, 1, 2].map(() => ({ chapterId: '2', isCorrect: false, timeSec: 90, at: today, testSessionId: null })),
      tests: [], todayIso: today });
    expect(m.cohort).toBe('improver');
    expect(m.tasks.find((t) => t.kind === 'drill')?.chapterId).toBe('2');
  });

  it('sprint phase 3 with no mock yet schedules a full mock', () => {
    const m = buildMission({ exam: 'JEE', daysLeft: 20, grade: 12, chapters: [ch('1', 'Optics', 20, 60)], attempts: [], tests: [], todayIso: today });
    expect(m.tasks.some((t) => t.kind === 'mock')).toBe(true);
  });

  it('foundation never schedules a full mock', () => {
    const m = buildMission({ exam: 'JEE', daysLeft: 500, grade: 11, chapters: [ch('1', 'Units', 0, 0), ch('2', 'Kinematics', 0, 0)], attempts: [], tests: [], todayIso: today });
    expect(m.tasks.some((t) => t.kind === 'mock')).toBe(false);
    expect(m.tasks[0].chapterId).toBe('1');
  });
});

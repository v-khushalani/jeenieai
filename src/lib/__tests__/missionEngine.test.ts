import { describe, it, expect } from 'vitest';
import { buildMission, classifyAttempt, deriveCohort, mockLoopStage, computeLeaks, buildMissionWeek, type MissionInput, type MissionChapter } from '../missionEngine';

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
      tests: [], todayIso: today, availableMinutes: 120 });
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

const balanced: MissionInput = {
  exam: 'JEE', daysLeft: 500, grade: 11, todayIso: today, attempts: [], tests: [],
  chapters: ['Physics', 'Chemistry', 'Mathematics'].flatMap((subject, i) => [
    { ...ch(`${i}a`, 'First chapter', 0, 0), chapterNumber: 1, subject, classLevel: 11, totalQuestions: 100 },
    { ...ch(`${i}b`, 'Coaching chapter', 10, 60), chapterNumber: 2, subject, classLevel: 11, totalQuestions: 100 },
  ]),
};
describe('daily schedule constraints', () => {
  it('fits the declared 120-minute budget with all three JEE subjects', () => {
    const m = buildMission({ ...balanced, availableMinutes: 120 });
    expect(m.plannedMinutes).toBeLessThanOrEqual(120);
    expect(new Set(m.tasks.map(t => t.subject))).toEqual(new Set(['Physics', 'Chemistry', 'Mathematics']));
  });
  it('Class 12 cannot receive Class 11 chapters even through coaching or backlog', () => {
    const m = buildMission({ ...balanced, grade: 12, coachingChapterIds: { Physics: '0a' }, backlogChapterId: '1a' });
    expect(m.tasks).toHaveLength(0);
  });
  it('one chapter cannot be assigned multiple practice or repair blocks', () => {
    const m = buildMission({ ...balanced, chapters: balanced.chapters.map(c => ({ ...c, pendingMistakes: 4 })) });
    const ids = m.tasks.map(t => t.chapterId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('coaching selection takes priority over a different chapter in its subject', () => {
    const m = buildMission({ ...balanced, coachingChapterIds: { Physics: '0b' } });
    expect(m.tasks.find(t => t.subject === 'Physics')?.chapterId).toBe('0b');
    expect(m.tasks.find(t => t.subject === 'Physics')?.lane).toBe('coaching');
  });
  it('backlog block is bounded to 45 minutes', () => {
    const m = buildMission({ ...balanced, availableMinutes: 300, coachingChapterIds: { Physics: '0b' }, backlogChapterId: '0a' });
    const backlog = m.tasks.find(t => t.lane === 'backlog');
    expect(backlog?.chapterId).toBe('0a');
    expect(backlog?.minutes).toBeLessThanOrEqual(45);
  });
  it('zero-question chapters do not get an actionable task', () => {
    expect(buildMission({ ...balanced, chapters: balanced.chapters.map(c => ({ ...c, totalQuestions: 0 })) }).tasks).toHaveLength(0);
  });
  it('full mocks keep the full-mode link and do not fit into a 120-minute day', () => {
    const short = buildMission({ ...balanced, cohortOverride: 'improver', availableMinutes: 120 });
    expect(short.tasks.some(t => t.kind === 'mock')).toBe(false);
    const full = buildMission({ ...balanced, cohortOverride: 'improver', availableMinutes: 180 });
    expect(full.tasks[0].href).toBe('/tests?mode=full&planner_task=mock-all');
    expect(full.plannedMinutes).toBe(180);
  });
  it('review takes precedence over a new mock and uses the specific test', () => {
    const m = buildMission({ ...balanced, cohortOverride: 'improver', tests: [{ id: 'latest', completedAt: today, title: 'Physics', totalQuestions: 20, attempted: 10, isFullMock: false }] });
    expect(m.tasks[0].testId).toBe('latest');
    expect(m.tasks.some(t => t.kind === 'mock')).toBe(false);
  });
  it('weekly budgets use 120 on weekdays and 240 on weekends', () => {
    const week = buildMissionWeek(balanced, 120, 240);
    expect(week.map(d => d.mission.budgetMinutes)).toEqual([120,120,120,120,120,240,240]);
    expect(week.every(d => d.mission.plannedMinutes <= d.mission.budgetMinutes)).toBe(true);
  });
  it('short days rotate subjects rather than always selecting Physics', () => {
    const week = buildMissionWeek(balanced, 15, 15);
    expect(new Set(week.map(d => d.mission.tasks[0].subject)).size).toBe(3);
  });
});

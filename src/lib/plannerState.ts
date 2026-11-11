import safeLocalStorage from '@/utils/safeStorage';
import type { Cohort, MissionTask } from './missionEngine';

export const plannerToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const missionKey = (uid: string) => `jeenie:mission:v2:${uid}:${plannerToday()}`;
export interface PlannerPreferences {
  weekdayMinutes: number;
  weekendMinutes: number;
  cohort: Cohort | null;
  coaching: Record<string, string>;
  backlogId: string;
}
export const defaultPreferences: PlannerPreferences = {
  weekdayMinutes: 180, weekendMinutes: 300, cohort: null, coaching: {}, backlogId: '',
};
export function readPreferences(uid: string): PlannerPreferences {
  try {
    const saved = JSON.parse(safeLocalStorage.getItem(`jeenie:planner-settings:${uid}`) || 'null');
    return saved ? { ...defaultPreferences, ...saved } : { ...defaultPreferences, coaching: {} };
  } catch { return { ...defaultPreferences, coaching: {} }; }
}
export function savePreferences(uid: string, prefs: PlannerPreferences) {
  safeLocalStorage.setItem(`jeenie:planner-settings:${uid}`, JSON.stringify(prefs));
}
export interface TaskEvidence { questionIds: string[]; offline?: boolean; reviewed?: boolean }
export function readEvidence(uid: string, date = plannerToday()): Record<string, TaskEvidence> {
  try { return JSON.parse(safeLocalStorage.getItem(`jeenie:planner-evidence:${uid}:${date}`) || '{}'); }
  catch { return {}; }
}
export function writeEvidence(uid: string, taskId: string, evidence: TaskEvidence) {
  const all = readEvidence(uid);
  all[taskId] = evidence;
  safeLocalStorage.setItem(`jeenie:planner-evidence:${uid}:${plannerToday()}`, JSON.stringify(all));
}
export function recordPlannerAnswer(uid: string, taskId: string, questionId: string) {
  if (!taskId) return;
  const old = readEvidence(uid)[taskId] || { questionIds: [] };
  writeEvidence(uid, taskId, { ...old, questionIds: [...new Set([...old.questionIds, questionId])] });
}
export function taskComplete(task: MissionTask, evidence?: TaskEvidence): boolean {
  if (evidence?.offline || evidence?.reviewed) return true;
  if (task.kind === 'analysis' || task.kind === 'mock' || task.kind === 'test') return false;
  return (evidence?.questionIds.length || 0) >= task.target;
}

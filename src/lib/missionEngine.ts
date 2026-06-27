/**
 * Today's Mission Engine — deterministic (no AI cost).
 * Given the user's profile + recent activity + chapter pool, return the
 * payload to persist via `get_or_create_today_mission` RPC.
 */
import safeLocalStorage from '@/utils/safeStorage';

export type MissionRule =
  | 'cold_start'
  | 'chapter_practice'
  | 'next_chapter'
  | 'weak_topic';

export interface MissionInput {
  userId: string;
  attempts: Array<{ question_id: string; created_at: string; is_correct: boolean }>;
  questionMeta: Record<string, { subject: string | null; chapter: string | null; chapter_id?: string | null }>;
  chapterPool: Array<{
    id: string;
    chapter_name?: string | null;
    name?: string | null;
    subject: string;
    chapter_number?: number | null;
  }>;
  totalAttempts: number;
  examTrack: 'JEE' | 'NEET' | 'MH_CET' | 'Class';
}

export interface MissionPayload {
  rule_id: MissionRule;
  title: string;
  subtitle: string;
  subject: string | null;
  chapter: string | null;
  chapter_id: string | null;
  mode: 'practice';
  target_count: number;
  est_minutes: number;
  reward_points: number;
  cta_route: string;
}

const COLD_START_KEY = (uid: string) => `jeenie_mission_starting_chapter_${uid}`;

export function getPickedStartingChapter(userId: string): {
  subject: string;
  chapter: string;
  chapter_id: string;
} | null {
  try {
    const raw = safeLocalStorage.getItem(COLD_START_KEY(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setPickedStartingChapter(
  userId: string,
  v: { subject: string; chapter: string; chapter_id: string }
) {
  try {
    safeLocalStorage.setItem(COLD_START_KEY(userId), JSON.stringify(v));
  } catch {/* noop */}
}

function chName(c: { chapter_name?: string | null; name?: string | null }) {
  return (c.chapter_name || c.name || '').trim();
}

function ctaForChapter(subject: string, chapter: string, chapterId?: string | null) {
  const base = `/practice?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}&source=mission`;
  return chapterId ? `${base}&chapter_id=${chapterId}` : base;
}

/**
 * Determine the active chapter:
 *   - Most-recently-practiced chapter in the last 7 days that the user hasn't
 *     hit 30+ correct attempts on (treated as "still learning").
 */
function findActiveChapter(input: MissionInput) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byChapter: Record<string, { subject: string; correct: number; total: number; last: number }> = {};
  for (const a of input.attempts) {
    const meta = input.questionMeta[a.question_id];
    const ch = (meta?.chapter || '').trim();
    if (!ch || !meta?.subject) continue;
    const t = new Date(a.created_at).getTime();
    if (isNaN(t)) continue;
    const key = `${meta.subject}::${ch}`;
    if (!byChapter[key]) byChapter[key] = { subject: meta.subject, correct: 0, total: 0, last: 0 };
    byChapter[key].total++;
    if (a.is_correct) byChapter[key].correct++;
    if (t > byChapter[key].last) byChapter[key].last = t;
  }
  const recent = Object.entries(byChapter)
    .filter(([, v]) => v.last >= cutoff && v.correct < 30)
    .sort(([, a], [, b]) => b.last - a.last);
  if (recent.length === 0) return null;
  const [key, v] = recent[0];
  const chapter = key.split('::')[1];
  // try to find chapter_id from pool
  const poolMatch = input.chapterPool.find(
    (c) =>
      c.subject?.toLowerCase() === v.subject.toLowerCase() &&
      chName(c).toLowerCase() === chapter.toLowerCase()
  );
  return { subject: v.subject, chapter, chapter_id: poolMatch?.id || null, correct: v.correct };
}

function findNextChapterAfter(
  pool: MissionInput['chapterPool'],
  subject: string,
  chapter: string
) {
  const subjectPool = pool
    .filter((c) => c.subject?.toLowerCase() === subject.toLowerCase())
    .sort((a, b) => (a.chapter_number || 0) - (b.chapter_number || 0));
  const idx = subjectPool.findIndex((c) => chName(c).toLowerCase() === chapter.toLowerCase());
  if (idx < 0) return subjectPool[0] || null;
  return subjectPool[idx + 1] || null;
}

export function buildMissionPayload(input: MissionInput): MissionPayload | { rule_id: 'cold_start' } {
  // 1. Cold start
  const picked = getPickedStartingChapter(input.userId);
  if (input.totalAttempts === 0 && !picked) {
    return { rule_id: 'cold_start' };
  }

  // 2. Active chapter (continue learning)
  const active = findActiveChapter(input);
  if (active) {
    const target = 10;
    return {
      rule_id: 'chapter_practice',
      title: `Continue Practice — ${active.chapter}`,
      subtitle: `Aaj ${target} questions aur — chapter strong ho jaayega 💪`,
      subject: active.subject,
      chapter: active.chapter,
      chapter_id: active.chapter_id,
      mode: 'practice',
      target_count: target,
      est_minutes: Math.max(10, target * 2),
      reward_points: 50,
      cta_route: ctaForChapter(active.subject, active.chapter, active.chapter_id),
    };
  }

  // 3. Picked chapter (cold-start follow-up)
  if (picked) {
    const target = 10;
    return {
      rule_id: 'chapter_practice',
      title: `Start Practice — ${picked.chapter}`,
      subtitle: `Pehla mission ready — ${picked.chapter} kholo aur start karo!`,
      subject: picked.subject,
      chapter: picked.chapter,
      chapter_id: picked.chapter_id,
      mode: 'practice',
      target_count: target,
      est_minutes: 20,
      reward_points: 50,
      cta_route: ctaForChapter(picked.subject, picked.chapter, picked.chapter_id),
    };
  }

  // 4. Fallback: first chapter from pool
  const first = input.chapterPool[0];
  if (first) {
    const ch = chName(first);
    const target = 10;
    return {
      rule_id: 'next_chapter',
      title: `Start Practice — ${ch}`,
      subtitle: `Naya chapter, naya mission. Chalo shuru karte hain!`,
      subject: first.subject,
      chapter: ch,
      chapter_id: first.id,
      mode: 'practice',
      target_count: target,
      est_minutes: 20,
      reward_points: 50,
      cta_route: ctaForChapter(first.subject, ch, first.id),
    };
  }

  // last-resort
  return {
    rule_id: 'chapter_practice',
    title: `Quick Practice`,
    subtitle: `10 questions solve karo — streak alive!`,
    subject: null,
    chapter: null,
    chapter_id: null,
    mode: 'practice',
    target_count: 10,
    est_minutes: 15,
    reward_points: 50,
    cta_route: '/study-now',
  };
}

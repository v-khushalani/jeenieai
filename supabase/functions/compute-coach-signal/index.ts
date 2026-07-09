// Coach signal: computes live percentile prediction + one proactive nudge for the student.
// Stateless — reads recent attempts, mastery, revision schedule, class logs, mission history.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const IST_TZ = 'Asia/Kolkata';
const istDate = () => new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ })).toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

interface Signal {
  prediction: {
    exam: string;
    on_track_percentile: number;
    off_track_percentile: number;
    delta: number;
    trend: 'up' | 'flat' | 'down';
    confidence: 'low' | 'medium' | 'high';
  };
  streak: { current: number; best: number; today_done: boolean };
  weekly_report: {
    week_start: string;
    active_days: number;
    total_questions: number;
    accuracy: number;
    accuracy_change: number; // vs previous week
    top_subject: string | null;
    weakest_subject: string | null;
    focus_next_week: string;
  } | null;
  nudge: { emoji: string; message: string; tone: 'push' | 'praise' | 'warn' } | null;
  factors: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: 'unauthorized' }, 401);
    const userId = userRes.user.id;
    const admin = createClient(supabaseUrl, serviceKey);

    const [profileRes, attemptsRes, masteryRes, revRes, classLogRes, missionRes] = await Promise.all([
      admin.from('profiles').select('goal_exam, target_exam, daily_study_minutes, prep_mode').eq('id', userId).maybeSingle(),
      admin.from('question_attempts').select('is_correct, attempted_at').eq('user_id', userId).gte('attempted_at', daysAgo(30)).order('attempted_at', { ascending: false }).limit(1000),
      admin.from('topic_mastery').select('subject, mastery_level, questions_attempted, last_attempted').eq('user_id', userId).limit(300),
      admin.from('revision_schedule').select('subject, next_due_at').eq('user_id', userId).lte('next_due_at', new Date().toISOString()).limit(50),
      admin.from('class_logs').select('subject, logged_date').eq('user_id', userId).gte('logged_date', daysAgo(7)).order('logged_date', { ascending: false }).limit(20),
      admin.from('daily_missions').select('mission_date, status, completed_blocks, blocks').eq('user_id', userId).gte('mission_date', daysAgo(14)).order('mission_date', { ascending: false }).limit(14),
    ]);

    const exam = (profileRes.data?.goal_exam || profileRes.data?.target_exam || 'JEE').toString().toUpperCase();
    const attempts = attemptsRes.data ?? [];
    const mastery = masteryRes.data ?? [];
    const dueRev = revRes.data ?? [];
    const classLogs = classLogRes.data ?? [];
    const missions = missionRes.data ?? [];

    // --- signals ---
    const total = attempts.length;
    const correct = attempts.filter(a => a.is_correct).length;
    const accuracy = total > 0 ? correct / total : 0;

    // Last 7d vs 8-14d accuracy → trend
    const last7 = attempts.filter(a => a.attempted_at >= daysAgo(7));
    const prev7 = attempts.filter(a => a.attempted_at >= daysAgo(14) && a.attempted_at < daysAgo(7));
    const acc7 = last7.length ? last7.filter(a => a.is_correct).length / last7.length : accuracy;
    const accPrev = prev7.length ? prev7.filter(a => a.is_correct).length / prev7.length : accuracy;
    const trend: Signal['prediction']['trend'] = acc7 - accPrev > 0.03 ? 'up' : acc7 - accPrev < -0.03 ? 'down' : 'flat';

    // Consistency: how many of last 14 days had completed missions
    const activeDays = missions.filter(m => (m.completed_blocks ?? 0) > 0).length;
    const consistency = activeDays / 14; // 0..1

    // Coverage: distinct subjects with mastery > 0
    const subjectsTouched = new Set(mastery.filter(m => (m.mastery_level ?? 0) > 0).map(m => m.subject).filter(Boolean));
    const expectedSubjects = exam.includes('NEET') ? 3 : 3;
    const coverage = Math.min(1, subjectsTouched.size / expectedSubjects);

    // Avg mastery
    const avgMastery = mastery.length
      ? mastery.reduce((s, m) => s + (m.mastery_level ?? 0), 0) / mastery.length / 100
      : 0;

    // Predicted percentile — weighted composite (0..100), capped realistic for JEE/NEET
    const base = 55; // realistic floor for an engaged student
    const gain =
      accuracy * 22 +
      consistency * 12 +
      coverage * 6 +
      avgMastery * 8 +
      (trend === 'up' ? 2 : trend === 'down' ? -2 : 0);
    const onTrack = Math.max(35, Math.min(99.5, Math.round((base + gain) * 10) / 10));
    // If they skip today → -0.4 to -0.8 depending on consistency
    const skipPenalty = 0.4 + (1 - consistency) * 0.6;
    const offTrack = Math.max(30, Math.round((onTrack - skipPenalty) * 10) / 10);

    const confidence: Signal['prediction']['confidence'] =
      total < 30 ? 'low' : total < 150 ? 'medium' : 'high';

    // --- nudge picker (priority order) ---
    let nudge: Signal['nudge'] = null;

    // 1) 3+ dayssince last mission activity
    const daysSinceActive = missions.findIndex(m => (m.completed_blocks ?? 0) > 0);
    if (daysSinceActive >= 3 || missions.length === 0) {
      nudge = { emoji: '⚡', tone: 'push', message: `${daysSinceActive >= 0 ? daysSinceActive : 3} din se mission miss ho rahi — aaj sirf 30 min de do, momentum wapas aayega.` };
    }
    // 2) Revision overload
    else if (dueRev.length >= 5) {
      nudge = { emoji: '📚', tone: 'warn', message: `${dueRev.length} topics revision ke liye due hain — 2 kar liye toh percentile 0.5 jump karega.` };
    }
    // 3) Subject imbalance (last 7d)
    else if (last7.length >= 10) {
      // heuristic — subject imbalance based on class_logs
      const subjectCounts: Record<string, number> = {};
      classLogs.forEach(c => { subjectCounts[c.subject] = (subjectCounts[c.subject] ?? 0) + 1; });
      const sorted = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]);
      if (sorted.length >= 2 && sorted[0][1] >= sorted[sorted.length - 1][1] * 2) {
        const heavy = sorted[0][0]; const light = sorted[sorted.length - 1][0];
        nudge = { emoji: '⚖️', tone: 'warn', message: `Pichhle hafte ${heavy} zyada, ${light} kam — kal ${light} pe focus karo.` };
      }
    }
    // 4) Trending up → praise
    if (!nudge && trend === 'up' && total >= 20) {
      nudge = { emoji: '🔥', tone: 'praise', message: `Accuracy 7 din mein ${Math.round((acc7 - accPrev) * 100)}% up — same pace rakha to percentile ${(onTrack + 1).toFixed(1)} tak jaayega.` };
    }
    // 5) Cold start
    if (!nudge && total < 10) {
      nudge = { emoji: '🚀', tone: 'push', message: `Aaj ki mission complete kar do — 3 din ka data aa jaayega toh JEEnie fully adapt karegi.` };
    }

    const signal: Signal = {
      prediction: {
        exam,
        on_track_percentile: onTrack,
        off_track_percentile: offTrack,
        delta: Math.round((onTrack - offTrack) * 10) / 10,
        trend,
        confidence,
      },
      streak: computeStreak(missions),
      weekly_report: buildWeeklyReport(missions, attempts, mastery, classLogs),
      nudge,
      factors: {
        attempts_30d: total, accuracy_30d: Math.round(accuracy * 100),
        accuracy_last_7d: Math.round(acc7 * 100),
        active_days_14d: activeDays,
        coverage: Math.round(coverage * 100),
        avg_mastery: Math.round(avgMastery * 100),
        due_revisions: dueRev.length,
      },
    };

    return json(signal);
  } catch (e) {
    console.error('compute-coach-signal error', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Consecutive-day streak (IST) — a day counts if any mission block was completed.
function computeStreak(missions: Array<{ mission_date: string; completed_blocks: number | null }>) {
  const today = istDate();
  const doneDates = new Set(missions.filter(m => (m.completed_blocks ?? 0) > 0).map(m => m.mission_date));
  let current = 0;
  const d = new Date(today);
  // Start from today; if today not done, streak still counts yesterday-back
  if (doneDates.has(today)) { current++; d.setDate(d.getDate() - 1); }
  else { d.setDate(d.getDate() - 1); }
  while (doneDates.has(d.toISOString().slice(0, 10))) { current++; d.setDate(d.getDate() - 1); }
  // Best streak = max consecutive run in the last 14 days window
  const sorted = [...doneDates].sort();
  let best = 0, run = 0, prev: Date | null = null;
  for (const ds of sorted) {
    const cur = new Date(ds);
    if (prev && (cur.getTime() - prev.getTime()) === 86400000) run++; else run = 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return { current, best: Math.max(best, current), today_done: doneDates.has(today) };
}

function buildWeeklyReport(
  missions: Array<{ mission_date: string; completed_blocks: number | null }>,
  attempts: Array<{ is_correct: boolean; attempted_at: string }>,
  mastery: Array<{ subject: string | null; mastery_level: number | null }>,
  classLogs: Array<{ subject: string; logged_date: string }>,
) {
  // Only surface report on Sunday (IST)
  const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }));
  if (todayIST.getDay() !== 0) return null;

  const weekStart = new Date(todayIST); weekStart.setDate(weekStart.getDate() - 6);
  const weekStartISO = weekStart.toISOString().slice(0, 10);
  const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekStartISO = prevWeekStart.toISOString().slice(0, 10);

  const inWeek = attempts.filter(a => a.attempted_at.slice(0, 10) >= weekStartISO);
  const inPrev = attempts.filter(a => a.attempted_at.slice(0, 10) >= prevWeekStartISO && a.attempted_at.slice(0, 10) < weekStartISO);
  const acc = inWeek.length ? Math.round(inWeek.filter(a => a.is_correct).length / inWeek.length * 100) : 0;
  const accPrev = inPrev.length ? Math.round(inPrev.filter(a => a.is_correct).length / inPrev.length * 100) : acc;

  const activeDays = missions.filter(m => m.mission_date >= weekStartISO && (m.completed_blocks ?? 0) > 0).length;

  // Top / weakest subjects by mastery
  const bySubject: Record<string, { sum: number; n: number }> = {};
  mastery.forEach(m => {
    if (!m.subject) return;
    bySubject[m.subject] = bySubject[m.subject] ?? { sum: 0, n: 0 };
    bySubject[m.subject].sum += m.mastery_level ?? 0;
    bySubject[m.subject].n += 1;
  });
  const ranked = Object.entries(bySubject).map(([s, v]) => ({ s, avg: v.sum / v.n })).sort((a, b) => b.avg - a.avg);
  const topSubject = ranked[0]?.s ?? null;
  const weakestSubject = ranked.length > 1 ? ranked[ranked.length - 1].s : null;

  const focus = weakestSubject
    ? `Agle hafte ${weakestSubject} pe zyada focus — 3 din out of 7 minimum.`
    : `Momentum banaye rakho — daily 1 revision + 1 practice block enough hai.`;

  return {
    week_start: weekStartISO,
    active_days: activeDays,
    total_questions: inWeek.length,
    accuracy: acc,
    accuracy_change: acc - accPrev,
    top_subject: topSubject,
    weakest_subject: weakestSubject,
    focus_next_week: focus,
  };
}


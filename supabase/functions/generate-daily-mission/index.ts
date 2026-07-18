// Generate today's study mission for a student.
// Deterministic v2: reads profile, recent attempts, topic mastery, class logs,
// revision schedule. Composes 2-5 blocks with dynamic question counts and
// chapter-targeted deep-links. Each block has clear "why + kya + goal" so the
// student knows exactly what to do and why.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type BlockType = 'learn_practice' | 'revision' | 'weak_fix' | 'class_recap' | 'pyq' | 'mock';
interface BlockProgress {
  attempted: number;
  correct: number;
  status: 'pending' | 'in_progress' | 'done';
  seen_ids: string[];
}
interface MissionBlock {
  id: string;
  type: BlockType;
  title: string;
  subtitle: string;
  subject?: string;
  chapter_id?: string;
  chapter_name?: string;
  topic_id?: string;
  minutes: number;
  question_count: number;   // exact number of Q to serve
  passing_goal: number;     // correct answers required to mark done
  xp_reward: number;        // XP given on block completion
  why: string;              // JEEnie's reason — data-driven
  what: string;             // exact task summary
  goal: string;             // pass criteria
  action_href: string;      // deep-link with all params baked in
  progress: BlockProgress;
}

const XP_PER_Q: Record<BlockType, number> = {
  learn_practice: 10,
  revision: 12,
  weak_fix: 15,
  class_recap: 12,
  pyq: 20,
  mock: 25,
};
function xpFor(type: BlockType, count: number) { return XP_PER_Q[type] * count; }

const IST_TZ = 'Asia/Kolkata';
const istDate = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }));
  return d.toISOString().slice(0, 10);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: 'unauthorized' }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const force: boolean = body?.force === true;

    const admin = createClient(supabaseUrl, serviceKey);
    const today = istDate();

    if (!force) {
      const { data: existing } = await admin
        .from('daily_missions')
        .select('*')
        .eq('user_id', userId)
        .eq('mission_date', today)
        .maybeSingle();
      if (existing) return json({ mission: existing, cached: true });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, prep_mode, daily_study_minutes, goal_exam, target_exam, grade, subjects')
      .eq('id', userId)
      .maybeSingle();

    const prepMode = (profile?.prep_mode ?? 'guided') as 'guided'|'companion'|'dropper'|'hybrid';
    const dailyMinutes = clamp(profile?.daily_study_minutes ?? 120, 30, 300);
    const exam = (profile?.goal_exam || profile?.target_exam || 'JEE').toString().toUpperCase();
    const subjects = deriveSubjects(exam, profile?.subjects);

    const [attemptsRes, masteryRes, classLogRes, dueRevRes] = await Promise.all([
      admin.from('question_attempts')
        .select('question_id, is_correct, attempted_at')
        .eq('user_id', userId)
        .gte('attempted_at', daysAgo(14))
        .order('attempted_at', { ascending: false })
        .limit(500),
      admin.from('topic_mastery')
        .select('topic_id, mastery_level, questions_attempted, questions_correct, last_attempted')
        .eq('user_id', userId)
        .order('last_attempted', { ascending: false })
        .limit(200),
      admin.from('class_logs')
        .select('id, subject, chapter_id, chapter_name, topic_id, topic_name, logged_date, source')
        .eq('user_id', userId)
        .gte('logged_date', daysAgo(3))
        .order('logged_date', { ascending: false })
        .limit(10),
      admin.from('revision_schedule')
        .select('subject, chapter_id, topic_id, next_due_at, interval_days, last_accuracy, correct_streak')
        .eq('user_id', userId)
        .lte('next_due_at', new Date().toISOString())
        .order('next_due_at', { ascending: true })
        .limit(20),
    ]);

    const attempts = attemptsRes.data ?? [];
    const mastery = masteryRes.data ?? [];
    const classLogs = classLogRes.data ?? [];
    const dueRevisions = dueRevRes.data ?? [];

    const totalQs = attempts.length;
    const correctQs = attempts.filter(a => a.is_correct).length;
    const accuracy = totalQs > 0 ? Math.round((correctQs / totalQs) * 100) : 0;

    const adaptiveDifficulty: 'easy' | 'medium' | 'hard' =
      accuracy >= 75 ? 'hard' : accuracy >= 50 ? 'medium' : 'easy';

    // Enrich weak topics with subject + chapter info so we can deep-link
    const weakTopicIds = mastery.filter(m => (m.questions_attempted ?? 0) >= 2).map(m => m.topic_id);
    let topicMeta: Record<string, { name?: string; subject?: string; chapter_id?: string; chapter_name?: string }> = {};
    if (weakTopicIds.length > 0) {
      const { data: tRows } = await admin
        .from('topics')
        .select('id, name, subject, chapter_id, chapter:chapters(name)')
        .in('id', weakTopicIds as string[]);
      (tRows ?? []).forEach((t: any) => {
        topicMeta[t.id] = {
          name: t.name,
          subject: t.subject,
          chapter_id: t.chapter_id ?? undefined,
          chapter_name: t.chapter?.name ?? undefined,
        };
      });
    }

    // Count recent mistakes per topic (for weak_fix sizing)
    const mistakesByTopic: Record<string, number> = {};
    const attemptedQids = new Set<string>();
    attempts.forEach(a => attemptedQids.add(a.question_id));

    const blocks: MissionBlock[] = [];
    let remaining = dailyMinutes;
    const takeMinutes = (m: number) => { const t = Math.min(m, remaining); remaining -= t; return t; };
    const mkProgress = (): BlockProgress => ({ attempted: 0, correct: 0, status: 'pending', seen_ids: [] });

    // ── BLOCK 1: Class recap / today's chapter (companion, hybrid) ──
    const freshClass = classLogs.find(c => c.logged_date === today) || classLogs[0];
    if ((prepMode === 'companion' || prepMode === 'hybrid') && freshClass) {
      const isToday = freshClass.logged_date === today;
      const qCount = isToday ? 10 : 12;
      const mins = takeMinutes(Math.min(isToday ? 30 : 40, Math.round(dailyMinutes * (isToday ? 0.25 : 0.35))));
      const chapName = freshClass.chapter_name ?? freshClass.subject;
      if (mins >= 12) blocks.push({
        id: crypto.randomUUID(),
        type: isToday ? 'class_recap' : 'learn_practice',
        title: isToday ? `Class recap — ${chapName}` : `Practice — ${chapName}`,
        subtitle: `${qCount} questions · ~${mins} min`,
        subject: freshClass.subject,
        chapter_id: freshClass.chapter_id ?? undefined,
        chapter_name: freshClass.chapter_name ?? undefined,
        topic_id: freshClass.topic_id ?? undefined,
        minutes: mins,
        question_count: qCount,
        passing_goal: Math.ceil(qCount * 0.6),
        xp_reward: xpFor(isToday ? 'class_recap' : 'learn_practice', qCount),
        why: isToday
          ? `Aaj ${chapName} class mein padha — abhi recap karega toh 70% content 7 din tak yaad rahega.`
          : `${daysBetween(freshClass.logged_date, today)} din pehle ${chapName} class hui — spaced practice ka ideal window.`,
        what: `${qCount} targeted Q solve kar (${chapName})`,
        goal: `${Math.ceil(qCount * 0.6)}/${qCount} sahi = block done ✅`,
        action_href: isToday && !freshClass.chapter_id
          ? `/recap/${freshClass.id}`
          : buildPracticeHref({
              mode: 'chapter',
              subject: freshClass.subject,
              chapter_id: freshClass.chapter_id,
              chapter: freshClass.chapter_name,
              topic_id: freshClass.topic_id,
              difficulty: adaptiveDifficulty,
              target: qCount,
            }),
        progress: mkProgress(),
      });
    }

    // ── BLOCK 2: Weak-topic fix (dynamic count) ──
    const weakSorted = [...mastery]
      .filter(m => (m.questions_attempted ?? 0) >= 2 && (m.mastery_level ?? 100) < 70)
      .sort((a, b) => (a.mastery_level ?? 0) - (b.mastery_level ?? 0));
    const weak = weakSorted[0];
    if (weak && remaining >= 15) {
      const meta = topicMeta[weak.topic_id] ?? {};
      const wrongCount = Math.max(0, (weak.questions_attempted ?? 0) - (weak.questions_correct ?? 0));
      const qCount = clamp(Math.max(8, wrongCount + 3), 8, 15);
      const mins = takeMinutes(Math.min(Math.max(15, qCount * 2), remaining));
      const wAcc = Math.round(((weak.questions_correct ?? 0) / Math.max(1, weak.questions_attempted ?? 1)) * 100);
      const topicLabel = meta.name || 'this topic';
      blocks.push({
        id: crypto.randomUUID(),
        type: 'weak_fix',
        title: `Weak-fix — ${topicLabel}`,
        subtitle: `${qCount} targeted Q · ~${mins} min`,
        subject: meta.subject,
        chapter_id: meta.chapter_id,
        chapter_name: meta.chapter_name,
        topic_id: weak.topic_id,
        minutes: mins,
        question_count: qCount,
        passing_goal: Math.ceil(qCount * 0.6),
        xp_reward: xpFor('weak_fix', qCount),
        why: `${topicLabel}: last ${weak.questions_attempted} me se ${weak.questions_correct} sahi (${wAcc}%). Yeh fix ho gaya toh overall percentile ~2 point improve hoga.`,
        what: `${qCount} targeted Q — sirf ${topicLabel} pe`,
        goal: `${Math.ceil(qCount * 0.6)}/${qCount} sahi karo toh weak-tag hatega`,
        action_href: buildPracticeHref({
          mode: 'weak',
          topic_id: weak.topic_id,
          chapter_id: meta.chapter_id,
          subject: meta.subject,
          difficulty: wAcc >= 60 ? 'medium' : 'easy',
          target: qCount,
        }),
        progress: mkProgress(),
      });
    }

    // ── BLOCK 3: Spaced revision (Ebbinghaus due) ──
    if (remaining >= 15 && dueRevisions.length > 0) {
      const rev = dueRevisions[0];
      const qCount = clamp(dueRevisions.length >= 5 ? 12 : 8, 6, 12);
      const mins = takeMinutes(Math.min(qCount * 3, remaining));
      const revLabel = rev.subject ?? subjects[0] ?? 'Revision';
      const daysSince = rev.interval_days ? Math.round(Number(rev.interval_days)) : 3;
      blocks.push({
        id: crypto.randomUUID(),
        type: 'revision',
        title: `Revise — ${revLabel}`,
        subtitle: `${qCount} spaced-repetition Q · ~${mins} min`,
        subject: revLabel,
        chapter_id: rev.chapter_id ?? undefined,
        topic_id: rev.topic_id ?? undefined,
        minutes: mins,
        question_count: qCount,
        passing_goal: Math.ceil(qCount * 0.7),
        xp_reward: xpFor('revision', qCount),
        why: `${daysSince} din pehle ye topic padha tha — Ebbinghaus curve ke hisaab se aaj revise nahi kiya toh 40% bhool jaayega.`,
        what: `${qCount} mixed-Q from ${revLabel} (revision mode)`,
        goal: `${Math.ceil(qCount * 0.7)}/${qCount} sahi = revision cleared`,
        action_href: buildPracticeHref({
          mode: 'revision',
          subject: revLabel,
          chapter_id: rev.chapter_id ?? undefined,
          topic_id: rev.topic_id ?? undefined,
          difficulty: adaptiveDifficulty,
          target: qCount,
        }),
        progress: mkProgress(),
      });
    }

    // ── BLOCK 4: PYQ (dropper / high-time) ──
    if (remaining >= 20 && (prepMode === 'dropper' || dailyMinutes >= 150)) {
      const pyqSubject = subjects[(new Date().getDate() + 1) % subjects.length] ?? subjects[0];
      const qCount = 5;
      const mins = takeMinutes(Math.min(qCount * 5, remaining));
      blocks.push({
        id: crypto.randomUUID(),
        type: 'pyq',
        title: `PYQ — ${pyqSubject}`,
        subtitle: `${qCount} previous-year Q · ~${mins} min`,
        subject: pyqSubject,
        minutes: mins,
        question_count: qCount,
        passing_goal: 3,
        xp_reward: xpFor('pyq', qCount),
        why: `Real ${exam} paper ka feel — exam-level difficulty pe apni speed check kar.`,
        what: `${qCount} PYQ from ${pyqSubject}`,
        goal: `3/${qCount} sahi = exam-ready confidence`,
        action_href: buildPracticeHref({
          mode: 'pyq',
          subject: pyqSubject,
          difficulty: adaptiveDifficulty,
          target: qCount,
        }),
        progress: mkProgress(),
      });
    }

    // ── FALLBACK: New user, no data → baseline ──
    if (blocks.length === 0) {
      const starterSubject = subjects[0] ?? 'Physics';
      const qCount = 10;
      const mins = Math.min(30, dailyMinutes);
      blocks.push({
        id: crypto.randomUUID(),
        type: 'learn_practice',
        title: `Warm-up — ${starterSubject}`,
        subtitle: `${qCount} baseline Q · ~${mins} min`,
        subject: starterSubject,
        minutes: mins,
        question_count: qCount,
        passing_goal: 6,
        xp_reward: xpFor('learn_practice', qCount),
        why: `Abhi tera data kam hai — ${qCount} Q se JEEnie ko baseline milegi, phir kal se personal plan aayega.`,
        what: `${qCount} mixed-difficulty Q from ${starterSubject}`,
        goal: `6/${qCount} sahi = baseline set`,
        action_href: buildPracticeHref({
          mode: 'diagnostic',
          subject: starterSubject,
          target: qCount,
        }),
        progress: mkProgress(),
      });
    }

    const totalMinutes = blocks.reduce((s, b) => s + b.minutes, 0);
    const reasoning = buildReasoning({
      prepMode, dailyMinutes, accuracy, totalQs,
      hasClass: !!freshClass, dueCount: dueRevisions.length, adaptiveDifficulty,
    });

    // Bake mission_id into action_href AFTER upsert — do it in a two-step
    const { data: mission, error: upsertErr } = await admin
      .from('daily_missions')
      .upsert({
        user_id: userId,
        mission_date: today,
        prep_mode: prepMode,
        total_minutes: totalMinutes,
        blocks,
        reasoning,
        status: 'pending',
        completed_blocks: 0,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,mission_date' })
      .select()
      .single();

    if (upsertErr) {
      console.error('mission upsert error', upsertErr);
      return json({ error: upsertErr.message }, 500);
    }

    // Second pass: append mission_id + block_id to each href, save
    const enrichedBlocks = (mission.blocks as MissionBlock[]).map((b) => ({
      ...b,
      action_href: appendMissionParams(b.action_href, mission.id, b.id),
    }));
    const { data: updated } = await admin
      .from('daily_missions')
      .update({ blocks: enrichedBlocks })
      .eq('id', mission.id)
      .select()
      .single();

    return json({ mission: updated ?? mission, cached: false });
  } catch (e) {
    console.error('generate-daily-mission error', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  const da = new Date(a).getTime(); const db = new Date(b).getTime();
  return Math.max(0, Math.round((db - da) / 86400000));
}

function deriveSubjects(exam: string, provided: unknown): string[] {
  if (Array.isArray(provided) && provided.length > 0) return provided.map(String);
  if (exam.includes('NEET')) return ['Physics', 'Chemistry', 'Biology'];
  return ['Physics', 'Chemistry', 'Mathematics'];
}

function buildPracticeHref(opts: {
  mode: string;
  subject?: string | null;
  chapter?: string | null;
  chapter_id?: string | null;
  topic_id?: string | null;
  difficulty?: string;
  target?: number;
}) {
  const p = new URLSearchParams();
  if (opts.mode) p.set('mode', opts.mode);
  if (opts.subject) p.set('subject', opts.subject);
  if (opts.chapter) p.set('chapter', opts.chapter);
  if (opts.chapter_id) p.set('chapter_id', opts.chapter_id);
  if (opts.topic_id) p.set('topic_id', opts.topic_id);
  if (opts.difficulty) p.set('difficulty', opts.difficulty);
  if (opts.target) p.set('target', String(opts.target));
  return `/practice?${p.toString()}`;
}

function appendMissionParams(href: string, missionId: string, blockId: string) {
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}mission_id=${missionId}&block_id=${blockId}`;
}

function buildReasoning({ prepMode, dailyMinutes, accuracy, totalQs, hasClass, dueCount, adaptiveDifficulty }: {
  prepMode: string; dailyMinutes: number; accuracy: number; totalQs: number; hasClass: boolean; dueCount: number; adaptiveDifficulty: string;
}) {
  const bits: string[] = [];
  bits.push(`Mode: ${prepMode}. Aaj ke ${dailyMinutes} min plan kiye.`);
  if (totalQs > 0) bits.push(`Pichhle 14 din: ${totalQs} Q · ${accuracy}% accuracy → difficulty ${adaptiveDifficulty}.`);
  if (dueCount > 0) bits.push(`${dueCount} topic revision ke liye due hain.`);
  if (hasClass && (prepMode === 'companion' || prepMode === 'hybrid')) bits.push('Class log ke basis par priorities set kiye.');
  return bits.join(' ');
}

// Generate today's study mission for a student.
// Deterministic v1 (no LLM): reads profile, recent attempts, topic mastery, class logs.
// Composes 2-4 blocks of 30-90 min that add up to the user's daily_study_minutes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type BlockType = 'learn_practice' | 'revision' | 'weak_fix' | 'class_recap' | 'pyq' | 'mock';
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
  question_count: number;
  why: string;         // "Why this?" one-liner
  action_href: string; // deeplink
}

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

    // Verify caller
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

    // Return existing mission for today unless force=true
    if (!force) {
      const { data: existing } = await admin
        .from('daily_missions')
        .select('*')
        .eq('user_id', userId)
        .eq('mission_date', today)
        .maybeSingle();
      if (existing) return json({ mission: existing, cached: true });
    }

    // Load profile
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, prep_mode, daily_study_minutes, goal_exam, target_exam, grade, subjects')
      .eq('id', userId)
      .maybeSingle();

    const prepMode = (profile?.prep_mode ?? 'guided') as 'guided'|'companion'|'dropper'|'hybrid';
    const dailyMinutes = clamp(profile?.daily_study_minutes ?? 120, 30, 300);
    const exam = (profile?.goal_exam || profile?.target_exam || 'JEE').toString().toUpperCase();
    const subjects = deriveSubjects(exam, profile?.subjects);

    // Load signals
    const [attemptsRes, masteryRes, classLogRes, dueRevRes] = await Promise.all([
      admin.from('question_attempts')
        .select('question_id, is_correct, attempted_at')
        .eq('user_id', userId)
        .gte('attempted_at', daysAgo(14))
        .order('attempted_at', { ascending: false })
        .limit(300),
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

    // Adaptive difficulty from rolling accuracy
    const adaptiveDifficulty: 'easy' | 'medium' | 'hard' =
      accuracy >= 75 ? 'hard' : accuracy >= 50 ? 'medium' : 'easy';

    // Compose blocks based on mode
    const blocks: MissionBlock[] = [];
    let remaining = dailyMinutes;
    const takeMinutes = (m: number) => { const t = Math.min(m, remaining); remaining -= t; return t; };

    // Companion / hybrid mode: today's class first
    const freshClass = classLogs.find(c => c.logged_date === today) || classLogs[0];
    if ((prepMode === 'companion' || prepMode === 'hybrid') && freshClass) {
      const isToday = freshClass.logged_date === today;
      const mins = takeMinutes(Math.min(isToday ? 30 : 60, Math.round(dailyMinutes * (isToday ? 0.3 : 0.5))));
      if (mins >= 15) blocks.push({
        id: crypto.randomUUID(),
        type: isToday ? 'class_recap' : 'learn_practice',
        title: isToday ? `Class recap: ${freshClass.chapter_name ?? freshClass.subject}` : `Practice: ${freshClass.chapter_name ?? freshClass.subject}`,
        subtitle: isToday ? `10 questions from aaj ki class` : `${Math.floor(mins / 3)} questions from ${freshClass.chapter_name ?? freshClass.subject}`,
        subject: freshClass.subject,
        chapter_id: freshClass.chapter_id ?? undefined,
        chapter_name: freshClass.chapter_name ?? undefined,
        topic_id: freshClass.topic_id ?? undefined,
        minutes: mins,
        question_count: isToday ? 10 : Math.floor(mins / 3),
        why: isToday
          ? `Aaj coaching mein ${freshClass.chapter_name ?? freshClass.subject} padha — abhi 10-Q recap = 70% retention.`
          : `${daysBetween(freshClass.logged_date, today)} din pehle class hui — spaced practice ka best time.`,
        action_href: isToday
          ? `/recap/${freshClass.id}`
          : `/practice?mode=chapter&subject=${encodeURIComponent(freshClass.subject)}${freshClass.chapter_id ? `&chapter=${freshClass.chapter_id}` : ''}`,
      });
    }

    // Weak-topic fix (lowest mastery)
    const weak = [...mastery].filter(m => (m.questions_attempted ?? 0) >= 5)
      .sort((a, b) => (a.mastery_level ?? 0) - (b.mastery_level ?? 0))[0];
    if (weak && remaining >= 25) {
      const mins = takeMinutes(Math.min(60, Math.round(dailyMinutes * 0.35)));
      const wAcc = Math.round(((weak.questions_correct ?? 0) / Math.max(1, weak.questions_attempted ?? 1)) * 100);
      const targetedDiff = wAcc >= 60 ? 'medium' : 'easy';
      blocks.push({
        id: crypto.randomUUID(),
        type: 'weak_fix',
        title: `Weak-spot fix`,
        subtitle: `${Math.floor(mins / 3)} targeted questions (${targetedDiff})`,
        topic_id: weak.topic_id,
        minutes: mins,
        question_count: Math.floor(mins / 3),
        why: `Accuracy ${wAcc}% — fix ho gaya to overall percentile 2 point improve hoga.`,
        action_href: `/practice?mode=weak&topic=${weak.topic_id}&difficulty=${targetedDiff}`,
      });
    }

    // Revision block — Ebbinghaus spaced repetition (real due items)
    if (remaining >= 20 && dueRevisions.length > 0) {
      const rev = dueRevisions[0];
      const mins = takeMinutes(Math.min(45, remaining));
      const revLabel = rev.subject ?? subjects[0] ?? 'Revision';
      const daysSince = rev.interval_days ? Math.round(Number(rev.interval_days)) : 0;
      blocks.push({
        id: crypto.randomUUID(),
        type: 'revision',
        title: `Revise ${revLabel}`,
        subtitle: `${Math.floor(mins / 3)} spaced-repetition Qs`,
        subject: revLabel,
        chapter_id: rev.chapter_id ?? undefined,
        topic_id: rev.topic_id ?? undefined,
        minutes: mins,
        question_count: Math.floor(mins / 3),
        why: `${daysSince} din pehle padha — Ebbinghaus curve ke hisaab se aaj revise nahi kiya to 40% bhool jaoge.`,
        action_href: `/practice?mode=revision${rev.chapter_id ? `&chapter=${rev.chapter_id}` : ''}${rev.topic_id ? `&topic=${rev.topic_id}` : ''}&difficulty=${adaptiveDifficulty}`,
      });
    } else if (remaining >= 20 && subjects.length > 0) {
      const revSubject = subjects[new Date().getDate() % subjects.length];
      const mins = takeMinutes(Math.min(45, remaining));
      blocks.push({
        id: crypto.randomUUID(),
        type: 'revision',
        title: `Revise ${revSubject}`,
        subtitle: `${Math.floor(mins / 3)} baseline questions`,
        subject: revSubject,
        minutes: mins,
        question_count: Math.floor(mins / 3),
        why: `Abhi tak ${revSubject} ka revision schedule nahi bana — baseline set karte hain.`,
        action_href: `/practice?mode=revision&subject=${encodeURIComponent(revSubject)}&difficulty=${adaptiveDifficulty}`,
      });
    }

    // PYQ block for dropper / high-time users
    if (remaining >= 20 && (prepMode === 'dropper' || dailyMinutes >= 150)) {
      const pyqSubject = subjects[(new Date().getDate() + 1) % subjects.length] ?? subjects[0];
      const mins = takeMinutes(Math.min(40, remaining));
      blocks.push({
        id: crypto.randomUUID(),
        type: 'pyq',
        title: `PYQs — ${pyqSubject}`,
        subtitle: `${Math.floor(mins / 4)} previous-year (${adaptiveDifficulty})`,
        subject: pyqSubject,
        minutes: mins,
        question_count: Math.floor(mins / 4),
        why: `Exam-level questions — real difficulty ka feel aayega.`,
        action_href: `/practice?mode=pyq&subject=${encodeURIComponent(pyqSubject)}&difficulty=${adaptiveDifficulty}`,
      });
    }

    // Fallback: if nothing composed yet (new user, no data), give a starter block
    if (blocks.length === 0) {
      const starterSubject = subjects[0] ?? 'Physics';
      blocks.push({
        id: crypto.randomUUID(),
        type: 'learn_practice',
        title: `Start with ${starterSubject}`,
        subtitle: '15 warm-up questions',
        subject: starterSubject,
        minutes: Math.min(45, dailyMinutes),
        question_count: 15,
        why: 'Naye ho — pehle baseline banate hain, phir AI adapt karega.',
        action_href: `/practice?mode=diagnostic&subject=${encodeURIComponent(starterSubject)}`,
      });
    }

    const totalMinutes = blocks.reduce((s, b) => s + b.minutes, 0);
    const reasoning = buildReasoning({ prepMode, dailyMinutes, accuracy, totalQs, hasClass: !!freshClass, dueCount: dueRevisions.length, adaptiveDifficulty });

    // Upsert
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

    return json({ mission, cached: false });
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

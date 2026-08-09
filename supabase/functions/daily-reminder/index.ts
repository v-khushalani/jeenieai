// Evening re-engagement push.
// Called by pg_cron at 19:30 and 21:30 IST.
// Body: { "slot": "evening" | "last_call" }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MESSAGES = {
  evening: (left: number) => ({
    title: 'Aaj ka goal adhoora hai 👀',
    body: `${left} XP aur — 10 minute ka kaam hai. Streak bacha le.`,
  }),
  last_call: (left: number) => ({
    title: 'Last call — streak khatre mein 🔥',
    body: `Sirf ${left} XP baaki. Abhi solve kar, warna kal se zero se shuru.`,
  }),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let slot: 'evening' | 'last_call' = 'evening';
    try {
      const body = await req.json();
      if (body?.slot === 'last_call') slot = 'last_call';
    } catch {
      // no body — default slot
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Last call only goes to students with a streak worth protecting.
    const minStreak = slot === 'last_call' ? 3 : 0;
    const { data: users, error } = await supabase.rpc('users_needing_reminder', {
      p_min_streak: minStreak,
    });
    if (error) throw error;

    const targets = users ?? [];
    let sent = 0;

    for (const u of targets) {
      const left = Math.max(1, Number(u.xp_goal) - Number(u.daily_xp));
      const msg = MESSAGES[slot](left);
      try {
        const res = await supabase.functions.invoke('send-push-notification', {
          body: { userId: u.user_id, title: msg.title, body: msg.body, url: '/practice' },
        });
        if (!res.error) sent++;
      } catch (_) {
        // one failed device must not stop the batch
      }
      // best-effort in-app notification as well
      await supabase.from('user_notifications').insert({
        user_id: u.user_id,
        title: msg.title,
        body: msg.body,
        message: msg.body,
        type: 'reminder',
        link: '/practice',
      });
    }

    return new Response(JSON.stringify({ slot, candidates: targets.length, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

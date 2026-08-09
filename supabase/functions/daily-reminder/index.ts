// Evening re-engagement push.
// Called by pg_cron at 19:30 and 21:30 IST.
// Body: { "slot": "evening" | "last_call" }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MESSAGES = {
  evening: {
    title: 'Aaj ka goal adhoora hai 👀',
    message: '10 minute ka kaam hai. Streak bacha le, abhi solve kar.',
  },
  last_call: {
    title: 'Last call — streak khatre mein 🔥',
    message: 'Thode XP baaki hain. Abhi nahi kiya toh kal se zero se shuru.',
  },
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

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    // Last call only goes to students with a streak worth protecting.
    const minStreak = slot === 'last_call' ? 3 : 0;
    const { data: users, error } = await supabase.rpc('users_needing_reminder', {
      p_min_streak: minStreak,
    });
    if (error) throw error;

    const targets = (users ?? []) as Array<{ user_id: string }>;
    if (targets.length === 0) {
      return new Response(JSON.stringify({ slot, candidates: 0, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const msg = MESSAGES[slot];
    const userIds = targets.map((u) => u.user_id);

    // Push (best effort — students without a subscription simply get the in-app one).
    let pushResult: unknown = null;
    try {
      const res = await supabase.functions.invoke('send-push-notification', {
        body: { title: msg.title, message: msg.message, user_ids: userIds },
        headers: { Authorization: `Bearer ${serviceKey}` },
      });
      pushResult = res.error ? { error: String(res.error) } : res.data;
    } catch (e) {
      pushResult = { error: String(e) };
    }

    // In-app notification for everyone in the list.
    await supabase.from('user_notifications').insert(
      userIds.map((id) => ({
        user_id: id,
        title: msg.title,
        body: msg.message,
        message: msg.message,
        type: 'reminder',
        link: '/practice',
      })),
    );

    return new Response(JSON.stringify({ slot, candidates: userIds.length, pushResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Monthly: give every student one streak freeze back.
// Called by the existing pg_cron job `monthly-streak-freeze-reset`.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error, count } = await supabase
      .from('profiles')
      .update({ streak_freeze_available: true, updated_at: new Date().toISOString() }, { count: 'exact' })
      .neq('streak_freeze_available', true);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, restored: count ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
